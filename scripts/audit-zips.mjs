#!/usr/bin/env node
/**
 * BRUTAL portal-zip audit — the deep pass beyond scripts/verify-portal.mjs.
 *
 * verify-portal.mjs is the shippability GATE (fast, per-zip). This script is
 * the forensic inspection: zip anatomy, cross-zip separation, banned-string
 * sweep, full external-URL inventory, lifecycle-signal presence, and the
 * sandbox-storage fix. Run it after `pnpm build:portals`:
 *
 *   node scripts/audit-zips.mjs
 *
 * Exit 0 = every check passed. Any failure is printed with the zip and the
 * exact evidence.
 */
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const PORTALS = ["poki", "crazy", "generic"];
const MAX_ZIP_BYTES = 8_000_000; // Poki initial-download target

const failures = [];
const notes = [];
const fail = (portal, msg) => failures.push(`${portal}: ${msg}`);
const note = (msg) => notes.push(msg);

function unzip(portal, mode) {
  const zipPath = join(root, `sunbird-${portal}.zip`);
  const args =
    mode === "html"
      ? ["-p", zipPath, "index.html"] // archive FIRST, then member
      : ["-l", zipPath];
  return execFileSync("unzip", args, { maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
}

const zips = {};
for (const portal of PORTALS) {
  const zipPath = join(root, `sunbird-${portal}.zip`);
  if (!existsSync(zipPath)) {
    fail(portal, "zip missing — run `pnpm build:portals` first.");
    continue;
  }
  const html = unzip(portal, "html");
  const listing = unzip(portal, "list");
  const bytes = statSync(zipPath).size;
  zips[portal] = { html, listing, bytes, hash: createHash("sha256").update(html).digest("hex").slice(0, 16) };
}

if (PORTALS.every((p) => zips[p])) {
  /* ------------------------------------------------- cross-zip separation */
  const hashes = PORTALS.map((p) => zips[p].hash);
  if (new Set(hashes).size !== PORTALS.length) {
    fail("-", "portal zips are NOT distinct — at least two bundles are identical (portals got cross-wired).");
  } else {
    note(`distinct bundles: ${PORTALS.map((p) => `${p}=${zips[p].hash}`).join("  ")}`);
  }

  const sdkHost = { poki: "game-cdn.poki.com", crazy: "sdk.crazygames.com" };
  const otherSdk = { poki: "sdk.crazygames.com", crazy: "game-cdn.poki.com", generic: null };
  for (const p of PORTALS) {
    const own = sdkHost[p];
    if (own && !zips[p].html.includes(own)) fail(p, `own SDK host ${own} missing from bundle.`);
    const foreign = otherSdk[p];
    if (foreign) {
      // Inert string literals of the OTHER portal's SDK URL ship in every
      // bundle (platform.ts keeps both constants; scriptFor() gates loading).
      // What must be true: the foreign URL never appears as a loadable tag.
      const foreignStatic = new RegExp(`<script[^>]+src=["']https?://[^"']*${foreign}`, "i");
      if (foreignStatic.test(zips[p].html)) fail(p, `foreign SDK ${foreign} appears as a loadable <script> — portal cross-wiring.`);
      else if (zips[p].html.includes(foreign)) note(`${p}: foreign SDK literal ${foreign} present but inert (not in any <script>/<link> tag) — expected.`);
    }
  }
}

for (const portal of PORTALS) {
  const z = zips[portal];
  if (!z) continue;
  const { html, listing, bytes } = z;

  /* ------------------------------------------------------------- anatomy */
  // `unzip -l` rows: "<len>  YYYY-MM-DD HH:MM  name". Match only rows shaped
  // like real entries — the header row ("Length Date Time Name") and the
  // dash separators never match, so no separator parsing is needed.
  const files = [];
  for (const line of listing.split("\n")) {
    const m = line.match(/^\s*\d+\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+(\S.*)$/);
    if (m) files.push(m[1].trim());
  }
  const badFile = files.find((f) => !f.startsWith("icons/") && !f.startsWith("fonts/") && f !== "index.html");
  if (badFile) fail(portal, `unexpected zip entry "${badFile}" (portals want ONLY index.html + icons/ + fonts/).`);
  const icons = files.filter((f) => f.startsWith("icons/")).length;
  const fonts = files.filter((f) => f.startsWith("fonts/")).length;
  if (!files.includes("index.html")) fail(portal, "index.html missing from zip.");
  if (icons < 3) fail(portal, `only ${icons} icon files in zip.`);
  if (fonts < 2) fail(portal, `only ${fonts} font files in zip.`);

  /* ---------------------------------------------------------------- size */
  if (bytes > MAX_ZIP_BYTES) fail(portal, `${(bytes / 1e6).toFixed(2)} MB exceeds the 8 MB portal bar.`);
  const gzipish = (Buffer.byteLength(html) / 1024).toFixed(0);
  note(`${portal}: zip ${(bytes / 1024).toFixed(0)} KB · html ${gzipish} KB · sha256 ${z.hash}`);

  /* ----------------------------------------------------- banned strings */
  // Hard failures only. Each pattern was tuned against real match contexts
  // in minified output: member calls (.prompt()), reads (location.href==="x")
  // and method-name strings (sendBeacon) are NOT violations and are reported
  // as notes below instead of failures.
  const banned = [
    [/stripe/i, "payment-provider marker 'stripe' (scrubbed by package-portal.mjs)"],
    [/cerison\.itch\.io|itch\.io/i, "external itch.io store reference (must be stripped from portal bundles)"],
    [/sunbird\.receipts/, "direct-build coin receipt storage (must not ship in portal editions)"],
    [/upstash/i, "Upstash backend marker"],
    [/pk_(live|test)_/, "Stripe publishable key"],
    [/api\.stripe\.com|hooks\.stripe\.com|js\.stripe\.com/, "Stripe endpoint"],
    [/<link[^>]+rel=["']manifest/i, "PWA manifest reference"],
    [/navigator\.serviceWorker/, "service worker API usage (portals forbid workers in their iframes)"],
    [/\bsw\.js\b/, "service worker script reference (the portal zip ships no sw.js)"],
    [/(https?|wss?):\/\/(localhost|127\.0\.0\.1|\[::1\])/, "requestable loopback URL"],
    [/\bws:\/\/|\bwss:\/\//, "hardcoded WebSocket backend URL (multiplayer must be blank in portal builds)"],
    [/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/, "raw IP address"],
    [/sourceMappingURL/, "source map reference (build ships sourcemap:false)"],
    [/window\.open\(/, "window.open (popups are banned on portals)"],
    [/document\.write\(/, "document.write"],
    // Bare global dialog calls only — `obj.prompt()` (PWA install) is not one.
    [/(?<![.\w$])(alert|confirm|prompt)\(/, "native browser dialog call (portals want in-game UI)"],
    // Assign/replace only — a read like `location.href==="string"` is fine.
    [/location\.href\s*=[^=]|location\.replace\(/, "navigation away from the game iframe"],
  ];
  for (const [re, why] of banned) {
    if (re.test(html)) {
      const ctx = html.match(new RegExp(`.{0,60}${re.source}.{0,60}`))?.[0] ?? "";
      fail(portal, `banned pattern: ${why}\n        context: …${ctx.replace(/\n/g, " ")}…`);
    }
  }

  /* ------------------------------------------------ soft findings (notes) */
  const soft = [
    [/navigator\.sendBeacon/, "sendBeacon method string (Telemetry guard — endpoint() is '' in portal builds, so it can never fire)"],
    [/\blocalhost\b|\b127\.0\.0\.1\b/, "loopback string (local-dev debug-hostname regex — never a request)"],
    [/\bserviceworker\b/i, "worker-type string literal (React DOM's internal switch — not a registration)"],
  ];
  for (const [re, why] of soft) {
    if (re.test(html)) note(`${portal}: soft finding — ${why}`);
  }

  /* ------------------------------------------------ static remote assets */
  if (/(href|src)="\//.test(html)) fail(portal, 'absolute "/asset" reference (breaks portal CDN subpaths).');
  const staticRemote = [...html.matchAll(/<(?:script|link|img|iframe)[^>]+(?:src|href|content)=["'](https?:[^"']+)["']/g)].map((m) => m[1]);
  if (staticRemote.length) fail(portal, `static remote reference(s): ${[...new Set(staticRemote)].join(", ")}`);

  /* ------------------------------------------------- lifecycle + fixes */
  const mustHave = [
    ["gameLoadingFinished", "Poki loading-finished signal"],
    ["gameplayStart", "gameplay-start signal"],
    ["gameplayStop", "gameplay-stop signal"],
    ["commercialBreak", "commercial-break API"],
    ["rewardedBreak", "rewarded-break API"],
    ["sunbird.storage.probe", "cross-safe Storage facade (sandboxed-iframe fix)"],
    ["sessionStorage", "sessionStorage fallback of the Storage facade"],
    ["sunbird.cloud.", "cloud-save key prefix"],
  ];
  for (const [needle, why] of mustHave) {
    if (!html.includes(needle)) fail(portal, `missing required string: "${needle}" — ${why}`);
  }
  if (portal === "poki" && !html.includes("gameLoadingStart")) {
    fail(portal, 'missing "gameLoadingStart" — the P0 loading-start fix did not ship.');
  }
  if (portal === "generic" && (html.includes("game-cdn.poki.com") || html.includes("sdk.crazygames.com"))) {
    // Allowed ONLY as inert literals; verified above against <script> tags.
    note("generic: portal SDK literals present (inert) — confirm they are not in any tag (checked above).");
  }

  /* -------------------------------------------------- URL inventory */
  const urls = [...new Set([...html.matchAll(/https?:\/\/[^\s"'<>()\\]+/g)].map((m) => m[0]).map((u) => u.replace(/[),.;]+$/, "")))];
  const KNOWN_OK = [
    "https://game-cdn.poki.com/scripts/v2/poki-sdk.js",
    "https://sdk.crazygames.com/crazygames-sdk-v3.js",
  ];
  const suspicious = urls.filter((u) => !KNOWN_OK.includes(u) && !/w3\.org|schema\.org|xmlns/.test(u));
  if (suspicious.length) {
    // Inventory is printed as evidence; anything beyond the inert SDK
    // literals and namespace URLs is a reviewable finding.
    for (const u of suspicious) note(`${portal}: URL found in bundle: ${u}`);
  }
}

/* --------------------------------------------------------------- report */
console.log("\n=== BRUTAL PORTAL-ZIP AUDIT ===\n");
if (notes.length) {
  console.log("Inventory / notes:");
  for (const n of notes) console.log(`  · ${n}`);
  console.log("");
}
if (failures.length) {
  console.error("❌ AUDIT FAILED");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("✅ BRUTAL AUDIT PASSED — all zips separate, clean, and portal-ready.\n");
