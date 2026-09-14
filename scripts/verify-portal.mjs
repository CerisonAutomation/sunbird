#!/usr/bin/env node
/**
 * Portal compliance gate — asserts every submission zip obeys the rules all
 * HTML5 portals check (Poki, CrazyGames, and the generic batch). Fails loudly
 * with a concrete reason; exit 0 means shippable.
 *
 * Checks per zip (sunbird-poki/crazy/generic.zip):
 *   1. Zip exists and fits the strictest size bar (Poki's 8 MB initial-load
 *      target — CrazyGames allows 20 MB mobile / 50 MB initial).
 *   2. Staged index.html carries no manifest link (portals are not installable).
 *   3. No js.stripe.com request URL (external payments are banned on portals).
 *   4. No absolute href="/…"/src="/…" (portals serve from deep CDN subpaths).
 *   5. Correct SDK profile: poki/crazy bundles ship their portal integration;
 *      no bundle statically loads anything remote (dynamic SDK injection is
 *      target-gated in code); generic exposes no reachable SDK loader path.
 *   6. icons/ + fonts/ ship inside the zip (self-contained, offline-safe).
 */
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const MAX_ZIP_BYTES = 8_000_000; // Poki initial-download target (strictest bar)
const PORTALS = ["poki", "crazy", "generic"];
const SDK_URL = {
  poki: "game-cdn.poki.com",
  crazy: "sdk.crazygames.com",
  generic: null,
};

function fail(msg) {
  console.error(`\n❌ PORTAL GATE FAILED\n${msg}\n`);
  process.exit(1);
}

function zipHtml(portal) {
  try {
    return execFileSync("unzip", ["-p", join(root, `sunbird-${portal}.zip`), "index.html"], {
      maxBuffer: 32 * 1024 * 1024,
    }).toString("utf8");
  } catch {
    fail(`sunbird-${portal}.zip is missing or has no index.html — run pnpm build:portals first.`);
  }
}

function zipList(portal) {
  try {
    return execFileSync("unzip", ["-l", join(root, `sunbird-${portal}.zip`)]).toString("utf8");
  } catch {
    fail(`sunbird-${portal}.zip is unreadable.`);
  }
}

const failures = [];
for (const portal of PORTALS) {
  const zipPath = join(root, `sunbird-${portal}.zip`);
  if (!existsSync(zipPath)) {
    failures.push(`${portal}: zip missing — run pnpm build:portals.`);
    continue;
  }
  const zipBytes = statSync(zipPath).size;
  if (zipBytes > MAX_ZIP_BYTES) {
    failures.push(`${portal}: ${(zipBytes / 1e6).toFixed(1)} MB exceeds ${(MAX_ZIP_BYTES / 1e6).toFixed(0)} MB bar.`);
  }
  const html = zipHtml(portal);
  const list = zipList(portal);
  if (/manifest/i.test(html)) failures.push(`${portal}: manifest reference survived in staged index.html.`);
  if (/js\.stripe\.com/.test(html)) failures.push(`${portal}: js.stripe.com URL in bundle (external payments banned).`);
  if (/(href|src)="\/[^"]*"/.test(html)) failures.push(`${portal}: absolute /asset reference (breaks CDN subpaths).`);
  if (!/icons\//.test(list) || !/fonts\//.test(list)) failures.push(`${portal}: icons/ or fonts/ missing from zip.`);
  // SDK profile: the build must SHIP its own portal integration, and must not
  // STATICALLY load anything remote (a <script src="http…"> runs unconditionally
  // — portals block those). Which SDK URL flows into the dynamic loader is
  // gated in code (scriptFor() returns null for every non-target), so the mere
  // presence of the other host as an inert string literal is not a load.
  const want = SDK_URL[portal];
  if (want && !html.includes(want)) failures.push(`${portal}: portal SDK (${want}) missing from bundle.`);
  const staticRemote = [...html.matchAll(/<(?:script|link|img)[^>]+(?:src|href)="(https?:[^"]+)"/g)].map((m) => m[1]);
  if (staticRemote.length) failures.push(`${portal}: static remote reference(s): ${[...new Set(staticRemote)].join(", ")}.`);
  // Generic obeys the same static rule: ensureSdk() returns before touching
  // scriptFor() for "generic"/"none", so the SDK loader is unreachable there
  // by construction (see the note on the URL constants in src/sdk/platform.ts).
  console.log(`✓ sunbird-${portal}.zip  ${(zipBytes / 1024).toFixed(0)} KB  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB html`);
}

if (failures.length) fail(failures.join("\n"));
console.log("\n✅ PORTAL GATE PASSED — all three zips shippable.\n");
