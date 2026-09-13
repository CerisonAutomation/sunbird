## 🟡 Written and tested in CI, not yet exercised in production
- `protocol/contract.json` — the single machine-checked source of truth for the
  wire protocol. Asserted by **both** implementations:
  `src/game/__tests__/protocol-contract.test.ts` and
  `rust/crates/sunbird-protocol/tests/contract.rs`. This exists because the
  "Rust is the source of truth, TS mirrors it" comment had already gone false:
  `ServerMessage::Snapshot` shipped in Rust with no TypeScript counterpart, so
  the browser would have thrown on the first authoritative snapshot. The
  mirror is now fixed *and* pinned.
- `rust/crates/sunbird-server/src/validate.rs` — server-authoritative movement
  envelope. Client `state` frames are now checked for finiteness, world bounds,
  distance regression and a **time-aware** speed cap derived from the client's
  own physics ceiling (234 u/s = 128 fever × 1.5 wingboost + 42 boost), then
  canonicalised to wire precision. Rejections are dropped and counted as
  `sunbird_legacy_state_rejected_total{reason=…}`; the seat is never dropped.
- `rust/crates/sunbird-protocol/src/lib.rs` — `Limits` was the only type in the
  protocol missing `rename_all = "camelCase"`, so `GET /v1/hello` emitted
  `max_json_payload_bytes` and the browser client's parser threw. Fixed and
  pinned by `hello_limits_are_camel_case_on_the_wire`. Found by the contract
  suite, which is the only reason it was found.
- `scripts/botsim.mjs` — 40 headless pilots on the real wire protocol, seeded
  and reproducible. Gated in `.github/workflows/botsim.yml`: the Node reference
  job reports cheat containment, the Rust job **gates** on it
  (`--require-anticheat`). Measured locally against the reference server:
  40/40 connected in 42 ms, roster 40/40, broadcast cadence p95 66.8 ms, 13
  unique finish places, 4/4 mid-race resumes.

- Server-side matchmaking is still aspirational; rooms are in-memory.
- Anti-cheat is **partial, not finished**. Movement plausibility is enforced
  (above), but identity, rate limiting and score-submission trust are not.
  Measured in CI for the record: the same 40 bots produce **16,082 relayed
  cheats** against the unvalidated Node reference server and **0** against the
  Rust one. Canonicalisation also cut per-client bandwidth 34.5%
  (79.56 → 52.11 KB/s) at identical cadence.
1. ~~Retire `scripts/mp-smoke.mjs` once this PR has been green a while — botsim
   supersedes it (40 clients vs 2, and it is actually wired into CI)~~
   **DONE.** Deleted; `npm run test:mp` now points at botsim so the old command
   keeps working. Verified against the Node reference server: 8/8 gates pass.
   botsim speaks the same legacy frame vocabulary as the browser client, so no
   protocol coverage was lost — only the 2-client subset.
2. **Build a v1 client transport** — this replaces the vaguer "wire the client
   to consume the `snapshot` message it can now parse", which understated the
   work. The two are *different protocols*, not two parsers of one:
   `Realtime.ts` speaks legacy (`welcome`/`peers`/`left`/`state`/`emote`/
   `finish`/`start`/`error`, terse tuple pilots) while
   `src/game/protocol/v1.ts` is v1 (`hello`/`welcome`/`rosterUpdate`/`started`/
   `snapshot`/`error`, rich `SeatGrant`/`RoomPublic`/`ServerSnapshot`).
   `Realtime.ts` imports only `PROTOCOL_VERSION` from the v1 module — the
   contract-pinned `parseServerMessage` is not on the shipped path at all.
   So consuming `snapshot` means implementing the v1 handshake and a
   snapshot-driven state applier, then cutting the room over. The parser being
   fixed was necessary but is not most of the job.

See `ARCHITECTURE_REVIEW.md` for the full comparison against the proposed
Bevy/Replicon rewrite, including what was rejected and why.

## ✅ Formerly "Next" — shipped in-repo (merged from both lines)
1. ~~Deploy `sunbird-server`~~ / ~~deploy `backend/`~~ — both server stacks are
   code-complete and CI-verified; production deploy needs a host + account keys
   (external). Rust `sunbird-server` owns multiplayer `/ws`; the Vercel
   `api/` functions own the daily leaderboard; the optional Cloudflare
   `backend/` Workers stack adds ghost replays, telemetry beacons, and
   server-authoritative Stripe entitlements (`/ghost`, `/telemetry`,
   `/entitlements`, `/stripe/webhook` — signature-verified, test-pinned).
2. ~~Real-player ghost replays on the daily seed (async PvP)~~ — SHIPPED:
   `GhostNet.ts` publishes your best daily flight (`POST /ghost`, thinned to
   ≤1500 samples, best-per-pilot-per-seed) and fetches a chaseable rival
   ghost near your PB (`GET /ghost`, never your own). Amber silhouette,
   pass-them bonus, silent no-op without a backend.
3. ~~First-run dive tutorial~~ — shipped earlier as FirstFlight coach.
4. ~~Coin sinks~~ — shipped: armed boosts, Nest upgrades (×10 tiers),
   trail shop, skin catalogue, gauntlet retries.
5. ~~Trail catalogue~~ — trails live in TRAILS with palette-parity test.

## External-only (needs accounts/keys, not code)
- Host deploys: WebSocket host for `rust/sunbird-server`
  (`VITE_MULTIPLAYER_URL=wss://…`), Vercel project for `api/` +
  `VITE_LEADERBOARD_URL`, optional Cloudflare deploy of `backend/` via wrangler.
- Stripe live payment links + webhook secret (`wrangler secret put STRIPE_WEBHOOK_SECRET`)
  — the webhook route itself is CODE-COMPLETE (`backend/src/entitlements.ts`,
  signature-verified, test-pinned; setup steps in DEPLOY.md §5)
- Portal submissions (zips build ready: poki / crazy / generic)
# Visual & Polish Audit — Sunbird

Written 2026-09-13. Every number here was **measured**, not eyeballed: there is
no browser in this environment, so nothing in this document is a claim about
how anything *looks*. Where a fix is marked DONE it was verified in the built
bundle or by a test.

---

## 1. Fixed and verified

| Item | Before | After | How verified |
| --- | --- | --- | --- |
| Menu bird sat *on* the sun | `bottom:56%` → 46% of the bird's ink inside the disc, 12px above the rim | `bottom:96%` → ink spans y[-79..-14], 0% overlap, 14px clear | Rasterised the real `sunbirdSVG`/`sunSVG` at the real CSS positions and measured ink bounding boxes |
| Bird's wings overhung into the card | `.hero` padding `0.3 × --hero-sun` = 50px, bird needs 79px | `0.48` = 80.6px; scales (116px clamp min needs 54.6, gets 55.7) | Same measurement |
| Menu sun/bird too small | 64px / 56px fixed | `clamp(116px,34vw,168px)`, bird 76% of it | `dist` CSS contains the clamp |
| Lobby sun clipped | 96px in a fixed 104px strip, `overflow:hidden`, `bottom:-22px` | 168px, fluid 136–180px strip, `bottom:-38px` | `dist` CSS |
| 42px of dead space above the title | `.hero{padding-top:42px}` clearance for a bird that no longer floats | removed | `padding-top:42px` absent from `dist` |
| Sun washed out | `.hero-sun{opacity:.55}` | `1` | `dist` CSS |
| Flat sticker shadows | one soft blur on bird and sun | two layers each (tight contact + wide ambient) | `dist` CSS |
| Hard dithered 3D shadows | `PCFShadowMap`, 1024 map | `PCFSoftShadowMap`, 2048 map | `shadowMap.type=Px`, `Px=2`, `mapSize.width=2048` in `dist` |
| **8 WCAG contrast failures** | 2.60–4.40:1 | all ≥ their threshold | `contrast.test.ts`; re-audit = 48 rules, 0 failures |
| Score repeated identically every pass | 64 fixed slots, byte-identical | 3-phrase variation + chord-tone turnaround fills | `music-variation.test.ts`, mutation-checked |
| Sky read as overcast | flat 3-stop gradient, no bright point | sun bloom in the dome (core + halo + crepuscular rays) | `sunDir`/`sunGlow` in `dist` |
| Murky distance | day fog `0x8ed0ee`, haze `0.04+d*0.055` | fog `0xcfeeff`, haze `0.008+d*0.012`, clouds halved in all 9 biomes | `sky-palette.test.ts` pins luminance/chroma vs the recorded old hex |
| Landmarks drawn twice | second `emit()` of the same spot for occlusion handles | emitted once, handles reused | 1066 → 1051 InstancedMeshes / 20 km |

Checks: **300 tests / 39 files**, `verify:prod` = PRODUCTION READY,
`physcheck` 22/22, `test:mp` 8/8 gates.

---

## 2. Open — the honest punch list, worst first

### A. The bird is painted in flat solid fills. *This is the biggest remaining "cheap" cause.*
`SUNBIRD_PALETTE` is 10 flat colours. `sunbirdSVG` (lines 268–334) contains no
gradient at all; the only `<radialGradient>` in the file is at line 349, inside
`sunSVG`. No rim light, no belly-to-back shading, no ambient occlusion where the
wing meets the body. Flat vector fills with no shading are the single most
reliable tell of amateur 2D art.

**Why it is not done:** `sunbird.test.ts` asserts an *identical fill list*
between the SVG and canvas renderers (26 tests). Gradients mean `url(#id)` on
one side and a `CanvasGradient` object on the other, so the contract itself has
to change — a two-renderer edit to the canonical asset that every bird in the
game is drawn from. Doing that with no way to see the result is how you ship a
broken bird. **Needs a session with a display.**

### B. No motion blur.
FOV widening with dolly-zoom counter-narrow (`CameraRig.ts:145`), bloom
(`Fx.ts`), screen shake and slow-motion peak launch all exist. Actual motion
blur does not. It is the one item on a standard "speed juice" list this game is
missing, and it is a contained post-processing pass.

### C. Wind-spirit spectators.
Eliminated players staying in the round as spirits that can gift boosts or
drafts. Genuinely absent — `grep -i "spirit\|spectator"` over `src/game/` finds
only prose strings, no mechanic. The best retention idea on the table, but it
needs server support to be fair, so it belongs **with** the v1 transport work,
not before it.

### D. The v1 protocol is dead code on the client.
`Realtime.ts` imports only `PROTOCOL_VERSION` from `protocol/v1.ts`. The
contract-pinned `parseServerMessage` is never called by shipped code, and the
two are *different protocols*, not two parsers of one. Building the v1 client
transport is the largest single piece of unfinished work in the repo.

### E. Two fairness gaps, both Rust, neither verifiable here.
Synchronised start can fire before the server signal on edge reconnects, and
signed seat tokens exist but are **not enforced on WS reconnect**. Also: no
interest management — `broadcast()` sends the full pilot array to every socket.

### F. Cannot be verified in this environment, at all.
No browser is installable (`cdn.playwright.dev` unreachable), no Rust toolchain
(no `cargo`/`rustc`, crates.io unreachable). So: no screenshot has ever been
taken of this game, and the Rust edits are type-checked by reading, not by
compiling.

---

## 3. What "worth more" would actually require

Not more visual tweaks. In priority order: the v1 transport (D), then interest
management and the two fairness gaps (E), then the bird shading (A). A and B are
what a player *sees*; D and E are what stops the game breaking at 40 players.
Both matter, and the second list is the one that is currently unstarted.
/**
 * Stripe webhook → server-owned entitlements.
 *
 * Closes the last audit gap (REPO_TRUTH_AUDIT #12: "Stripe entitlements are
 * not webhook-authoritative"). Flow:
 *
 *   1. Player opens a Stripe Payment Link; the client appends
 *      `client_reference_id=<deviceId>` (already shipped in Payments.ts).
 *   2. Stripe calls POST /stripe/webhook on checkout.session.completed.
 *      We verify the `Stripe-Signature` header (HMAC-SHA256 of
 *      `${t}.${rawBody}` with STRIPE_WEBHOOK_SECRET, 5-minute tolerance)
 *      — no Stripe SDK needed, Workers crypto.subtle is enough.
 *   3. The session's amount_total maps to a SKU (299→gold, 199→vip,
 *      99→starter — documented in DEPLOY.md) and is stored keyed by the
 *      deviceId from client_reference_id.
 *   4. The game calls GET /entitlements?device=… after payment and on
 *      restore; server-verified SKUs are granted with source
 *      "stripe_webhook". The local manual-confirm path survives only as a
 *      labelled fallback when no backend is configured.
 *
 * Honest scope: without STRIPE_WEBHOOK_SECRET set, the webhook rejects
 * everything (503) and the game behaves exactly as before.
 */

export type EntitlementEnv = { STRIPE_WEBHOOK_SECRET?: string };

const AMOUNT_TO_SKU: Record<number, string> = {
  299: "sunbird_gold",
  199: "sunbird_vip",
  99: "sunbird_starter",
};

const TOLERANCE_SECONDS = 300;

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time-ish hex comparison (length leak is fine, contents are not). */
function hexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Parses `Stripe-Signature: t=1699999999,v1=abc…,v1=def…`. */
export function parseStripeSignature(header: string): { t: number; v1: string[] } {
  const out = { t: 0, v1: [] as string[] };
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2);
    if (k?.trim() === "t") out.t = Number(v) || 0;
    if (k?.trim() === "v1" && v) out.v1.push(v.trim());
  }
  return out;
}

export async function verifyStripeSignature(
  secret: string,
  header: string | null,
  rawBody: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!header) return false;
  const { t, v1 } = parseStripeSignature(header);
  if (!t || v1.length === 0) return false;
  if (Math.abs(nowSeconds - t) > TOLERANCE_SECONDS) return false;
  const expected = await hmacHex(secret, `${t}.${rawBody}`);
  return v1.some((sig) => hexEqual(sig, expected));
}

type CheckoutSession = {
  id?: string;
  client_reference_id?: string | null;
  amount_total?: number | null;
  payment_status?: string;
};

type StripeEvent = {
  type?: string;
  data?: { object?: CheckoutSession };
};

/** Maps a completed checkout session to (deviceId, sku), or null. */
export function entitlementFromEvent(evt: StripeEvent): { deviceId: string; sku: string; sessionId: string } | null {
  if (evt.type !== "checkout.session.completed") return null;
  const s = evt.data?.object;
  if (!s) return null;
  if (s.payment_status && s.payment_status !== "paid" && s.payment_status !== "no_payment_required") return null;
  const deviceId = (s.client_reference_id ?? "").slice(0, 64);
  if (!deviceId) return null;
  const sku = AMOUNT_TO_SKU[s.amount_total ?? -1];
  if (!sku) return null;
  return { deviceId, sku, sessionId: (s.id ?? "").slice(0, 128) };
}
/**
 * Sunbird serverless backend — Cloudflare Workers (free plan).
 *
 * Why this stack (researched 2026-09):
 *  • Workers free tier: 100k requests/day, ~0 ms cold starts at 300+ edge
 *    locations — the best always-free compute tier of any major provider.
 *  • Durable Objects are now on the free plan (SQLite-backed): the only free
 *    serverless primitive with *stateful WebSockets* + strong consistency,
 *    which is exactly what a 40-pilot race room needs. Supabase Realtime and
 *    Deno Deploy were evaluated; neither gives a per-room single-threaded
 *    authority with hibernation-priced WebSockets.
 *  • WebSocket Hibernation: idle rooms cost zero duration, so the ~13k GB-s/day
 *    free duration budget is spent only while races are actually running.
 *
 * Endpoints (mirrors LEADERBOARD_API.md + server/sunbird-server.mjs):
 *   GET  /health              → { ok, rooms?, scores }
 *   GET  /board?scope&metric&device
 *   POST /score
 *   GET  /ws?device&name&skin&hue&room&seed   (WebSocket upgrade)
 *   GET  /                    (WebSocket upgrade, same as /ws — the client
 *                              connects to VITE_MULTIPLAYER_URL verbatim)
 */

export { RoomDO } from "./room";
export { LeaderboardDO } from "./leaderboard";
import { entitlementFromEvent, verifyStripeSignature } from "./entitlements";

export interface Env {
  ROOMS: DurableObjectNamespace;
  BOARD: DurableObjectNamespace;
  STRIPE_WEBHOOK_SECRET?: string;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newCode(): string {
  let out = "";
  for (let i = 0; i < 5; i++) out += CODE_ALPHABET[(Math.random() * CODE_ALPHABET.length) | 0];
  return out;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

/**
 * Public matchmaking directory.
 *
 * One well-known DO per (seed, shard) tracks which public room code is
 * currently filling. Private rooms skip this entirely: the room code *is* the
 * DO name, so friends land in the same object by construction.
 */
async function pickPublicRoom(env: Env, seed: string): Promise<string> {
  const dirId = env.ROOMS.idFromName(`dir:${seed}`);
  const dir = env.ROOMS.get(dirId);
  const res = await dir.fetch("https://do/directory/pick", { method: "POST" });
  if (res.ok) {
    const body = (await res.json()) as { code?: string };
    if (body.code) return body.code;
  }
  return newCode();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    /* -------------------------------------------------- WebSocket rooms */
    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const seed = (url.searchParams.get("seed") ?? todayStr()).slice(0, 64);
      let code = (url.searchParams.get("room") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
      const isPublic = code.length === 0;
      if (isPublic) code = await pickPublicRoom(env, seed);

      const roomId = env.ROOMS.idFromName(`room:${code}`);
      const room = env.ROOMS.get(roomId);
      // Forward the original query string so the room sees device/name/skin/hue.
      const fwd = new URL(`https://do/join${url.search}`);
      fwd.searchParams.set("room", code);
      fwd.searchParams.set("seed", seed);
      fwd.searchParams.set("public", isPublic ? "1" : "0");
      return room.fetch(fwd.toString(), request);
    }

    /* ------------------------------------------------------ HTTP routes */
    const board = env.BOARD.get(env.BOARD.idFromName("global"));

    if (url.pathname === "/health") {
      const res = await board.fetch("https://do/stats");
      const stats = (await res.json()) as Record<string, unknown>;
      return json({ ok: true, ...stats });
    }

    if (url.pathname === "/board" && request.method === "GET") {
      return board.fetch(`https://do/board${url.search}`).then(withCors);
    }

    if (url.pathname === "/stripe/webhook" && request.method === "POST") {
      // Server-authoritative purchase fulfilment (REPO_TRUTH_AUDIT #12).
      const secret = env.STRIPE_WEBHOOK_SECRET ?? "";
      if (!secret) return json({ error: "webhook not configured" }, 503);
      const raw = await request.text();
      if (raw.length > 65_536) return json({ error: "payload too large" }, 413);
      const ok = await verifyStripeSignature(secret, request.headers.get("stripe-signature"), raw);
      if (!ok) return json({ error: "bad signature" }, 400);
      let evt: unknown;
      try {
        evt = JSON.parse(raw);
      } catch {
        return json({ error: "invalid json" }, 400);
      }
      const grant = entitlementFromEvent(evt as Parameters<typeof entitlementFromEvent>[0]);
      // Unhandled event types are acknowledged so Stripe stops retrying.
      if (!grant) return json({ ok: true, handled: false });
      await board.fetch("https://do/entitlements/grant", {
        method: "POST",
        body: JSON.stringify(grant),
        headers: { "content-type": "application/json" },
      });
      return json({ ok: true, handled: true });
    }

    if (url.pathname === "/entitlements" && request.method === "GET") {
      return board.fetch(`https://do/entitlements${url.search}`).then(withCors);
    }

    if (url.pathname === "/ghost") {
      if (request.method === "POST") {
        const body = await request.text();
        if (body.length > 262_144) return json({ error: "payload too large" }, 413);
        return board
          .fetch("https://do/ghost", { method: "POST", body, headers: { "content-type": "application/json" } })
          .then(withCors);
      }
      return board.fetch(`https://do/ghost${url.search}`).then(withCors);
    }

    if (url.pathname === "/telemetry") {
      if (request.method === "POST") {
        const body = await request.text();
        if (body.length > 8192) return json({ error: "payload too large" }, 413);
        return board
          .fetch("https://do/telemetry", { method: "POST", body, headers: { "content-type": "application/json" } })
          .then(withCors);
      }
      return board.fetch("https://do/telemetry").then(withCors);
    }

    if (url.pathname === "/score" && request.method === "POST") {
      const body = await request.text();
      if (body.length > 4096) return json({ error: "payload too large" }, 413);
      return board
        .fetch("https://do/score", { method: "POST", body, headers: { "content-type": "application/json" } })
        .then(withCors);
    }

    return json({ error: "not found" }, 404);
  },
} satisfies ExportedHandler<Env>;

async function withCors(res: Response): Promise<Response> {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
  return out;
}
/**
 * LeaderboardDO — global leaderboard on SQLite-in-Durable-Objects.
 *
 * Free plan gives 5 GB of SQLite storage; each row here is < 200 bytes and
 * we keep exactly one row per device, so this scales to millions of pilots
 * without leaving the free tier.
 *
 * Contract (LEADERBOARD_API.md / src/game/Leaderboard.ts):
 *   GET  /board?scope=global|daily&metric=distance|altitude|perfects|coins&device=ID
 *        → { entries: BoardEntry[≤50], rank, total }
 *   POST /score  { deviceId, name, skin, distance, altitude, perfects, coins, score }
 *        → { ok: true }   (row replaced only when the new distance is higher)
 */

const METRICS = ["distance", "altitude", "perfects", "coins"] as const;
type Metric = (typeof METRICS)[number];

type Row = {
  deviceId: string;
  name: string;
  skin: string;
  distance: number;
  altitude: number;
  perfects: number;
  coins: number;
  score: number;
  date: string;
};

const clean = (v: unknown, n: number): string =>
  String(v ?? "")
    .replace(/[<>&"']/g, "")
    .slice(0, n);

const clampNum = (v: unknown, max: number): number => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n), max);
};

const todayStr = (): string => new Date().toISOString().slice(0, 10);

async function hmacHex(salt: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(salt), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class LeaderboardDO implements DurableObject {
  private readonly sql: SqlStorage;
  /** When LEADERBOARD_SALT is configured, unsigned submissions are rejected.
   * Honest scope: the salt ships inside the client bundle, so this deters
   * casual curl-spoofing — the plausibility gates below are the real teeth. */
  private readonly salt: string;

  constructor(state: DurableObjectState, env: unknown) {
    this.salt = String((env as { LEADERBOARD_SALT?: string })?.LEADERBOARD_SALT ?? "");
    this.sql = state.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS scores (
        deviceId TEXT PRIMARY KEY,
        name     TEXT NOT NULL,
        skin     TEXT NOT NULL,
        distance INTEGER NOT NULL,
        altitude INTEGER NOT NULL,
        perfects INTEGER NOT NULL,
        coins    INTEGER NOT NULL,
        score    INTEGER NOT NULL,
        date     TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_scores_date ON scores(date);
      CREATE TABLE IF NOT EXISTS entitlements (
        deviceId  TEXT NOT NULL,
        sku       TEXT NOT NULL,
        sessionId TEXT NOT NULL DEFAULT '',
        grantedAt TEXT NOT NULL,
        PRIMARY KEY (deviceId, sku)
      );
      CREATE TABLE IF NOT EXISTS ghosts (
        seed     TEXT NOT NULL,
        deviceId TEXT NOT NULL,
        name     TEXT NOT NULL,
        distance INTEGER NOT NULL,
        samples  TEXT NOT NULL,
        date     TEXT NOT NULL,
        PRIMARY KEY (seed, deviceId)
      );
      CREATE INDEX IF NOT EXISTS idx_ghosts_seed ON ghosts(seed, distance);
      CREATE TABLE IF NOT EXISTS telemetry (
        day  TEXT NOT NULL,
        k    TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT '',
        n    INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (day, k, mode)
      );
    `);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/entitlements/grant" && request.method === "POST") {
      // Internal route: only the worker's verified webhook handler calls this.
      let body: { deviceId?: unknown; sku?: unknown; sessionId?: unknown };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return Response.json({ error: "invalid json" }, { status: 400 });
      }
      const deviceId = clean(typeof body.deviceId === "string" ? body.deviceId : "", 64);
      const sku = clean(typeof body.sku === "string" ? body.sku : "", 32);
      if (!deviceId || !sku) return Response.json({ error: "deviceId and sku required" }, { status: 400 });
      this.sql.exec(
        `INSERT INTO entitlements (deviceId, sku, sessionId, grantedAt) VALUES (?, ?, ?, ?)
         ON CONFLICT(deviceId, sku) DO UPDATE SET sessionId = excluded.sessionId`,
        deviceId,
        sku,
        clean(typeof body.sessionId === "string" ? body.sessionId : "", 128),
        new Date().toISOString(),
      );
      return Response.json({ ok: true });
    }

    if (url.pathname === "/entitlements" && request.method === "GET") {
      const device = clean(url.searchParams.get("device"), 64);
      if (!device) return Response.json({ error: "device required" }, { status: 400 });
      const rows = this.sql
        .exec("SELECT sku, grantedAt FROM entitlements WHERE deviceId = ?", device)
        .toArray() as { sku: string; grantedAt: string }[];
      return Response.json({ entitlements: rows });
    }

    if (url.pathname === "/ghost" && request.method === "POST") {
      // Async PvP: publish your best daily-seed flight as a replayable ghost.
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return Response.json({ error: "invalid json" }, { status: 400 });
      }
      const seed = clean(typeof body.seed === "string" ? body.seed : "", 32);
      const deviceId = clean(typeof body.deviceId === "string" ? body.deviceId : "", 64);
      const name = clean(typeof body.name === "string" ? body.name : "", 24) || "Pilot";
      const distance = Math.floor(Number(body.distance) || 0);
      if (!seed || !deviceId) return Response.json({ error: "seed and deviceId required" }, { status: 400 });
      if (distance <= 0 || distance > 60_000) return Response.json({ error: "implausible distance" }, { status: 422 });
      if (!Array.isArray(body.samples) || body.samples.length < 5) {
        return Response.json({ error: "samples required" }, { status: 400 });
      }
      // Cap replay weight: 1500 samples of [t,x,y,rot] is ~7 min of flight.
      const samples = (body.samples as unknown[]).slice(0, 1500).filter(
        (s) => Array.isArray(s) && s.length === 4 && (s as unknown[]).every((n) => typeof n === "number" && Number.isFinite(n as number)),
      );
      if (samples.length < 5) return Response.json({ error: "samples malformed" }, { status: 400 });
      const packed = JSON.stringify(samples);
      if (packed.length > 131_072) return Response.json({ error: "replay too large" }, { status: 413 });
      // Keep only each pilot's best flight per seed.
      const prev = this.sql
        .exec("SELECT distance FROM ghosts WHERE seed = ? AND deviceId = ?", seed, deviceId)
        .toArray() as { distance: number }[];
      if (prev.length > 0 && prev[0]!.distance >= distance) {
        return Response.json({ ok: true, kept: "previous" });
      }
      this.sql.exec(
        `INSERT INTO ghosts (seed, deviceId, name, distance, samples, date) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(seed, deviceId) DO UPDATE SET name = excluded.name, distance = excluded.distance,
           samples = excluded.samples, date = excluded.date`,
        seed,
        deviceId,
        name,
        distance,
        packed,
        todayStr(),
      );
      return Response.json({ ok: true, kept: "new" });
    }

    if (url.pathname === "/ghost" && request.method === "GET") {
      // Serve the rival ghost closest to (just above) the requester's best —
      // a target you can realistically chase, never your own flight back.
      const seed = clean(url.searchParams.get("seed"), 32);
      const device = clean(url.searchParams.get("device"), 64);
      const near = Math.max(0, Math.floor(Number(url.searchParams.get("near")) || 0));
      if (!seed) return Response.json({ error: "seed required" }, { status: 400 });
      const rows = this.sql
        .exec(
          `SELECT deviceId, name, distance, samples FROM ghosts
           WHERE seed = ? AND deviceId != ?
           ORDER BY ABS(distance - ?) ASC LIMIT 5`,
          seed,
          device,
          Math.round(near * 1.15) + 150,
        )
        .toArray() as { deviceId: string; name: string; distance: number; samples: string }[];
      if (rows.length === 0) return Response.json({ ghost: null });
      const pick = rows[Math.floor(Math.random() * rows.length)]!;
      return Response.json({
        ghost: { name: pick.name, distance: pick.distance, samples: JSON.parse(pick.samples) as unknown },
      });
    }

    if (url.pathname === "/telemetry" && request.method === "POST") {
      // Aggregate-only product counters. No per-device rows are stored; the
      // deviceId in the payload is discarded after basic shape validation.
      let body: { events?: { k?: unknown; mode?: unknown }[] };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return Response.json({ error: "invalid json" }, { status: 400 });
      }
      const events = Array.isArray(body.events) ? body.events.slice(0, 64) : [];
      const day = todayStr();
      for (const ev of events) {
        const k = clean(typeof ev.k === "string" ? ev.k : "", 32);
        if (!k) continue;
        const mode = clean(typeof ev.mode === "string" ? ev.mode : "", 16);
        this.sql.exec(
          `INSERT INTO telemetry (day, k, mode, n) VALUES (?, ?, ?, 1)
           ON CONFLICT(day, k, mode) DO UPDATE SET n = n + 1`,
          day,
          k,
          mode,
        );
      }
      return Response.json({ ok: true });
    }

    if (url.pathname === "/telemetry" && request.method === "GET") {
      const rows = this.sql
        .exec("SELECT day, k, mode, n FROM telemetry ORDER BY day DESC, n DESC LIMIT 200")
        .toArray();
      return Response.json({ rows });
    }

    if (url.pathname === "/stats") {
      const row = this.sql.exec("SELECT COUNT(*) AS n FROM scores").one() as { n: number };
      return Response.json({ scores: row.n });
    }

    if (url.pathname === "/board") {
      const metricParam = url.searchParams.get("metric") ?? "distance";
      const metric: Metric = (METRICS as readonly string[]).includes(metricParam)
        ? (metricParam as Metric)
        : "distance";
      const scope = url.searchParams.get("scope") === "daily" ? "daily" : "global";
      const device = clean(url.searchParams.get("device"), 64);

      // `metric` is validated against the METRICS allowlist above, so it is
      // safe to interpolate as a column name.
      const where = scope === "daily" ? "WHERE date = ?" : "";
      const args = scope === "daily" ? [todayStr()] : [];

      const all = this.sql
        .exec(`SELECT * FROM scores ${where} ORDER BY ${metric} DESC, deviceId ASC`, ...args)
        .toArray() as unknown as Row[];

      const entries = all.slice(0, 50);
      const rank = device ? all.findIndex((r) => r.deviceId === device) + 1 : 0;
      return Response.json({ entries, rank, total: all.length });
    }

    if (url.pathname === "/score" && request.method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return Response.json({ error: "invalid json" }, { status: 400 });
      }

      const deviceId = clean(body.deviceId, 64);
      if (!deviceId) return Response.json({ error: "deviceId required" }, { status: 400 });

      // Signature gate (when configured): sig = HMAC-SHA256(salt, deviceId|distance|score).
      if (this.salt) {
        const expected = await hmacHex(this.salt, `${deviceId}|${clampNum(body.distance, 500_000)}|${clampNum(body.score, 5_000_000)}`);
        if (clean(body.sig, 128) !== expected) {
          return Response.json({ error: "bad signature" }, { status: 403 });
        }
      }

      // Plausibility gates — server-enforceable physics limits. A legit run
      // cannot post 100km, nor a score wildly out of line with its distance.
      const dist = clampNum(body.distance, 500_000);
      const score = clampNum(body.score, 5_000_000);
      if (dist > 60_000) return Response.json({ error: "implausible distance" }, { status: 422 });
      if (score > dist * 40 + 50_000) return Response.json({ error: "implausible score" }, { status: 422 });

      const row: Row = {
        deviceId,
        name: clean(body.name, 14) || "Pilot",
        skin: clean(body.skin, 24) || "sunbird",
        distance: clampNum(body.distance, 500_000),
        altitude: clampNum(body.altitude, 10_000),
        perfects: clampNum(body.perfects, 5_000),
        coins: clampNum(body.coins, 100_000),
        score: clampNum(body.score, 5_000_000),
        date: todayStr(),
      };

      // One row per device; only a better distance replaces the old run.
      this.sql.exec(
        `INSERT INTO scores (deviceId, name, skin, distance, altitude, perfects, coins, score, date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(deviceId) DO UPDATE SET
           name = excluded.name,
           skin = excluded.skin,
           distance = excluded.distance,
           altitude = excluded.altitude,
           perfects = excluded.perfects,
           coins = excluded.coins,
           score = excluded.score,
           date = excluded.date
         WHERE excluded.distance > scores.distance`,
        row.deviceId,
        row.name,
        row.skin,
        row.distance,
        row.altitude,
        row.perfects,
        row.coins,
        row.score,
        row.date,
      );

      return Response.json({ ok: true });
    }

    return Response.json({ error: "not found" }, { status: 404 });
  }
}
{
  // Sunbird backend — deploys to the Cloudflare Workers FREE plan.
  //
  //   cd backend && npm install && npx wrangler deploy
  //
  // Free-plan budget this design respects:
  //   • 100,000 requests/day (Worker + DO requests + WS messages at 20:1)
  //   • ~13,000 GB-s/day Durable Object duration (WebSocket Hibernation keeps
  //     idle rooms unbilled; the broadcast alarm only runs during live races)
  //   • 5 GB SQLite-in-DO storage for the leaderboard
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "sunbird-backend",
  "main": "src/index.ts",
  "compatibility_date": "2026-09-01",
  // Shared salt for HMAC-signed leaderboard submissions (LEADERBOARD_API.md).
  // Empty = accept unsigned posts (dev). Match VITE_LEADERBOARD_SALT client-side.
  // Stripe webhook signing secret (whsec_…) — set as a REAL secret in prod:
  //   npx wrangler secret put STRIPE_WEBHOOK_SECRET
  // Empty/unset = webhook endpoint answers 503 and payments stay client-manual.
  "vars": { "LEADERBOARD_SALT": "" },
  "observability": { "enabled": true },
  "durable_objects": {
    "bindings": [
      { "name": "ROOMS", "class_name": "RoomDO" },
      { "name": "BOARD", "class_name": "LeaderboardDO" }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["RoomDO", "LeaderboardDO"]
    }
  ]
}
{
  "timestamp": "2026-09-11T17:47:18.869Z",
  "results": [
    {
      "timestamp": "2026-09-11T17:45:27.179Z",
      "level": "✅",
      "project": "sunbird",
      "message": "Typecheck passed"
    },
    {
      "timestamp": "2026-09-11T17:45:28.798Z",
      "level": "✅",
      "project": "sunbird",
      "message": "Tests passed"
    },
    {
      "timestamp": "2026-09-11T17:45:31.143Z",
      "level": "✅",
      "project": "sunbird",
      "message": "Build successful"
    },
    {
      "timestamp": "2026-09-11T17:45:31.421Z",
      "level": "✅",
      "project": "sunbird",
      "message": "Health check passed (200)"
    },
    {
      "timestamp": "2026-09-11T17:45:31.482Z",
      "level": "⚠️",
      "project": "sunbird",
      "message": "CSP contains unsafe-inline"
    },
    {
      "timestamp": "2026-09-11T17:45:31.482Z",
      "level": "✅",
      "project": "sunbird",
      "message": "HTTPS enforced"
    },
    {
      "timestamp": "2026-09-11T17:45:31.482Z",
      "level": "✅",
      "project": "sunbird",
      "message": "Security headers present"
    },
    {
      "timestamp": "2026-09-11T17:45:32.893Z",
      "level": "⚠️",
      "project": "sunbird",
      "message": "Dependency check error"
    },
    {
      "timestamp": "2026-09-11T17:46:44.079Z",
      "level": "✅",
      "project": "fyk-consolidated",
      "message": "Typecheck passed"
    },
    {
      "timestamp": "2026-09-11T17:46:45.085Z",
      "level": "✅",
      "project": "fyk-consolidated",
      "message": "Tests passed"
    },
    {
      "timestamp": "2026-09-11T17:47:13.013Z",
      "level": "✅",
      "project": "fyk-consolidated",
      "message": "Build successful"
    },
    {
      "timestamp": "2026-09-11T17:47:14.799Z",
      "level": "✅",
      "project": "fyk-consolidated",
      "message": "Health check passed (200)"
    },
    {
      "timestamp": "2026-09-11T17:47:15.032Z",
      "level": "✅",
      "project": "fyk-consolidated",
      "message": "HTTPS enforced"
    },
    {
      "timestamp": "2026-09-11T17:47:15.032Z",
      "level": "✅",
      "project": "fyk-consolidated",
      "message": "Security headers present"
    },
    {
      "timestamp": "2026-09-11T17:47:18.869Z",
      "level": "⚠️",
      "project": "fyk-consolidated",
      "message": "Dependency check error"
    }
  ],
  "summary": {
    "passed": 12,
    "warnings": 3,
    "failures": 0
  }
}
    "test:mp": "node scripts/botsim.mjs --players 8 --seconds 6",
    "botsim": "node scripts/botsim.mjs",
    "botsim:40": "node scripts/botsim.mjs --players 40 --seconds 15",
{
  "_comment": [
    "SUNBIRD protocol v1 contract — THE single source of truth.",
    "",
    "Every limit, variant name, required field and canonical sample below is",
    "asserted mechanically by BOTH implementations:",
    "  - Rust  : rust/crates/sunbird-protocol/tests/contract.rs",
    "  - TS    : src/game/__tests__/protocol-contract.test.ts",
    "",
    "Change a value here and one or both suites fail until the mirrors agree.",
    "This file exists because 'the Rust crate is the source of truth and the TS",
    "file mirrors it' was a comment, not a check — and the two had already",
    "drifted (ServerMessage::Snapshot existed in Rust and not in TypeScript).",
    "",
    "Rules for editing:",
    "  1. Never add a variant without a canonical sample that both sides parse.",
    "  2. Never widen a limit without a matching note in PROTOCOL_NOTES.md.",
    "  3. Movement limits are derived from client physics constants — see",
    "     `movement.derivation`. Do not invent new numbers."
  ],

  "protocolVersion": 1,
  "minProtocolVersion": 1,

  "limits": {
    "maxJsonPayloadBytes": 8192,
    "maxNameChars": 14,
    "maxRoomCodeChars": 5,
    "maxSeedChars": 64,
    "maxSkinChars": 32,
    "maxIdempotencyChars": 80,
    "maxErrorMessageChars": 256,
    "sessionMinTokenChars": 16,
    "sessionMaxTokenChars": 512
  },

  "movement": {
    "_comment": "Server-authoritative plausibility envelope for legacy `state` frames.",
    "derivation": {
      "tickHz": 15,
      "maxSpeedUnitsPerSec": 234.0,
      "maxSpeedFormula": "MAX_SPEED_FEVER (128) * wingboost speedMult (1.5) + BOOST_EXTRA_SPEED (42) — src/game/Bird.ts:260 + src/game/PowerUps.ts:79",
      "deltaHeadroomFactor": 2.0,
      "maxStateDeltaXPerTickFormula": "234.0 / 15 * 2.0 = 31.2, rounded down to 31.0"
    },
    "tickHz": 15,
    "maxSpeedUnitsPerSec": 234.0,
    "speedHeadroomFactor": 2.0,
    "minSampleIntervalSec": 0.0167,
    "maxSampleIntervalSec": 2.0,
    "maxStateDeltaXPerTick": 31.0,
    "maxStateDeltaYPerTick": 31.0,
    "maxCoordinateAbs": 1000000.0,
    "maxAltitudeAbs": 100000.0,
    "maxRotationAbs": 12.5664,
    "maxDistance": 500000.0,
    "distanceRegressionTolerance": 0.5,
    "positionDecimalPlaces": 2,
    "rotationDecimalPlaces": 2
  },

  "clientMessages": {
    "join": {
      "required": ["version", "intentId", "seed", "name", "skin"],
      "optional": ["roomCode", "reconnectToken"],
      "sample": {
        "type": "join",
        "version": 1,
        "intentId": "6f1e2d3c-4b5a-4968-8797-a6b5c4d3e2f1",
        "roomCode": "K7QZM",
        "seed": "2026-09-12",
        "name": "Kestrel",
        "skin": "bluejay",
        "reconnectToken": null
      }
    },
    "leave": {
      "required": ["version", "roomId", "seatId"],
      "optional": [],
      "sample": {
        "type": "leave",
        "version": 1,
        "roomId": "1b4e28ba-2fa1-4d3f-9f36-2f3a5c6d7e8f",
        "seatId": "2c5f39cb-3ab2-4e40-a047-3a4b6d7e8f90"
      }
    },
    "ready": {
      "required": ["version", "roomId", "seatId", "ready"],
      "optional": [],
      "sample": {
        "type": "ready",
        "version": 1,
        "roomId": "1b4e28ba-2fa1-4d3f-9f36-2f3a5c6d7e8f",
        "seatId": "2c5f39cb-3ab2-4e40-a047-3a4b6d7e8f90",
        "ready": true
      }
    },
    "heartbeat": {
      "required": ["version", "roomId", "seatId", "sequence", "clientTime"],
      "optional": [],
      "sample": {
        "type": "heartbeat",
        "version": 1,
        "roomId": "1b4e28ba-2fa1-4d3f-9f36-2f3a5c6d7e8f",
        "seatId": "2c5f39cb-3ab2-4e40-a047-3a4b6d7e8f90",
        "sequence": 42,
        "clientTime": "2026-09-12T09:30:00Z"
      }
    },
    "reconnect": {
      "required": ["version", "roomId", "seatId", "reconnectToken"],
      "optional": [],
      "sample": {
        "type": "reconnect",
        "version": 1,
        "roomId": "1b4e28ba-2fa1-4d3f-9f36-2f3a5c6d7e8f",
        "seatId": "2c5f39cb-3ab2-4e40-a047-3a4b6d7e8f90",
        "reconnectToken": "sb1.opaque-reconnect-token"
      }
    }
  },

  "serverMessages": {
    "hello": {
      "required": ["version", "serverName", "limits"],
      "sample": {
        "type": "hello",
        "version": 1,
        "serverName": "sunbird-dev",
        "limits": { "version": 1, "maxJsonPayloadBytes": 8192, "maxNameChars": 14 }
      }
    },
    "welcome": {
      "required": ["version", "grant", "room"],
      "sample": {
        "type": "welcome",
        "version": 1,
        "grant": {
          "roomId": "1b4e28ba-2fa1-4d3f-9f36-2f3a5c6d7e8f",
          "seatId": "2c5f39cb-3ab2-4e40-a047-3a4b6d7e8f90",
          "playerId": "3d6a40dc-4bc3-4f51-b158-4b5c7e8f9012",
          "generation": 1,
          "reconnectToken": "sb1.opaque-reconnect-token"
        },
        "room": {
          "id": "1b4e28ba-2fa1-4d3f-9f36-2f3a5c6d7e8f",
          "code": "K7QZM",
          "seed": "2026-09-12",
          "capacity": 40,
          "hostSeatId": "2c5f39cb-3ab2-4e40-a047-3a4b6d7e8f90",
          "pilots": [
            {
              "joinedAt": "2026-09-12T09:30:00Z",
              "id": "2c5f39cb-3ab2-4e40-a047-3a4b6d7e8f90",
              "name": "Kestrel",
              "skin": "bluejay",
              "ready": false,
              "reconnecting": false
            }
          ]
        }
      }
    },
    "rosterUpdate": {
      "required": ["version", "room"],
      "sample": {
        "type": "rosterUpdate",
        "version": 1,
        "room": {
          "id": "1b4e28ba-2fa1-4d3f-9f36-2f3a5c6d7e8f",
          "code": "K7QZM",
          "seed": "2026-09-12",
          "capacity": 40,
          "hostSeatId": "2c5f39cb-3ab2-4e40-a047-3a4b6d7e8f90",
          "pilots": []
        }
      }
    },
    "started": {
      "required": ["version", "roomId", "startAt", "seed"],
      "sample": {
        "type": "started",
        "version": 1,
        "roomId": "1b4e28ba-2fa1-4d3f-9f36-2f3a5c6d7e8f",
        "startAt": "2026-09-12T09:30:06Z",
        "seed": "2026-09-12"
      }
    },
    "snapshot": {
      "required": ["version", "snapshot"],
      "_note": "This variant existed in Rust (ServerMessage::Snapshot) with no TypeScript mirror. Its absence is the drift this contract was written to make impossible.",
      "sample": {
        "type": "snapshot",
        "version": 1,
        "snapshot": {
          "serverTime": "2026-09-12T09:30:07Z",
          "tick": 105,
          "pilots": [
            {
              "seatId": "2c5f39cb-3ab2-4e40-a047-3a4b6d7e8f90",
              "x": 128.25,
              "y": 41.5,
              "rotation": -0.12,
              "distance": 64,
              "finished": false
            }
          ]
        }
      }
    },
    "error": {
      "required": ["version", "error"],
      "sample": {
        "type": "error",
        "version": 1,
        "error": { "code": "roomFull" }
      }
    }
  },

  "serverErrorCodes": [
    "unsupportedVersion",
    "invalidMessage",
    "payloadTooLarge",
    "rateLimited",
    "roomFull",
    "roomNotFound",
    "seatNotFound",
    "invalidReconnectToken",
    "rejected"
  ],

  "legacy": {
    "_comment": "The simple wire protocol the shipped browser client speaks on GET /ws. Unversioned by history; pinned here so a frame rename is a contract break, not a silent client failure.",
    "up": ["state", "emote", "ready", "finish"],
    "down": ["welcome", "peers", "left", "state", "emote", "finish", "start", "error"],
    "capacity": 40,
    "tickHz": 15,
    "stateFields": ["id", "x", "y", "rot", "distance"]
  }
}
# This file is automatically @generated by Cargo.
# It is not intended for manual editing.
version = 4

[[package]]
name = "ahash"
version = "0.8.12"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "5a15f179cd60c4584b8a8c596927aadc462e27f2ca70c04e0071964a73ba7a75"
dependencies = [
 "cfg-if",
 "once_cell",
 "version_check",
 "zerocopy",
]

[[package]]
name = "aho-corasick"
version = "1.1.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "c982642fa9e8606056828ee9a8505737230110bb1099153c79efe865c59d12ba"
dependencies = [
 "memchr",
]

[[package]]
name = "anyhow"
version = "1.0.104"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "330a5ed07fa54e4702c9d6c4174f74427fc0ef6e214bbd677ae50a5099946470"

[[package]]
name = "async-trait"
version = "0.1.92"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "82f6aeea286b8eb4dd3431a1be1b59d290ace00f5bfd8e2a159bc2a05e2c1667"
dependencies = [
 "proc-macro2",
 "quote",
 "syn 3.0.5",
]

[[package]]
name = "atomic-waker"
version = "1.1.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "1505bd5d3d116872e7271a6d4e16d81d0c8570876c8de68093a09ac269d8aac0"

[[package]]
name = "aws-lc-rs"
version = "1.18.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "b281d307588d634de920874890732659e2e7672f72b5e10e81badc1a8a83621e"
dependencies = [
 "aws-lc-sys",
 "zeroize",
]

[[package]]
name = "aws-lc-sys"
version = "0.45.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "9bff6c3b54fad79a2e60b8102caf565819711497c1f5f092f49508e2f5c31b27"
dependencies = [
 "cc",
 "cmake",
 "dunce",
 "fs_extra",
 "pkg-config",
]

[[package]]
name = "axum"
version = "0.7.9"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "edca88bc138befd0323b20752846e6587272d3b03b0343c8ea28a6f819e6e71f"
dependencies = [
 "async-trait",
 "axum-core",
 "base64",
 "bytes",
 "futures-util",
 "http",
 "http-body",
 "http-body-util",
 "hyper",
 "hyper-util",
 "itoa",
 "matchit",
 "memchr",
 "mime",
 "percent-encoding",
 "pin-project-lite",
 "rustversion",
 "serde",
 "serde_json",
 "serde_path_to_error",
 "serde_urlencoded",
 "sha1",
 "sync_wrapper",
 "tokio",
 "tokio-tungstenite",
 "tower",
 "tower-layer",
 "tower-service",
 "tracing",
]

[[package]]
name = "axum-core"
version = "0.4.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "09f2bd6146b97ae3359fa0cc6d6b376d9539582c7b4220f041a33ec24c226199"
dependencies = [
 "async-trait",
 "bytes",
 "futures-util",
 "http",
 "http-body",
 "http-body-util",
 "mime",
 "pin-project-lite",
 "rustversion",
 "sync_wrapper",
 "tower-layer",
 "tower-service",
 "tracing",
]

[[package]]
name = "base64"
version = "0.22.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "72b3254f16251a8381aa12e40e3c4d2f0199f8c6508fbecb9d91f575e0fbb8c6"

[[package]]
name = "bitflags"
version = "2.13.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "3ded4057c258ba199e2d26386d3af3780957ecaee6c4ef4041c6b4b8b97c0b06"

[[package]]
name = "block-buffer"
version = "0.10.4"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "3078c7629b62d3f0439517fa394996acacc5cbc91c5a20d8c658e77abd503a71"
dependencies = [
 "generic-array",
]

[[package]]
name = "bumpalo"
version = "3.20.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "72f5acc6cb2ba439de613abc23857ec3d78374d8ed5ac84e9d11336e87da8649"

[[package]]
name = "byteorder"
version = "1.5.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "1fd0f2584146f6f2ef48085050886acf353beff7305ebd1ae69500e27c67f64b"

[[package]]
name = "bytes"
version = "1.12.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "fc652a48c352aef3ea3aed32080501cf3ef6ed5da78602a020c991775b0aff04"

[[package]]
name = "cc"
version = "1.4.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "005ec2760ca554fae18df7a11195552ec576cd665632a881bc011d5bb2fd4d80"
dependencies = [
 "find-msvc-tools",
 "jobserver",
 "libc",
 "shlex",
]

[[package]]
name = "cfg-if"
version = "1.0.4"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "9330f8b2ff13f34540b44e946ef35111825727b38d33286ef986142615121801"

[[package]]
name = "cmake"
version = "0.1.58"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "c0f78a02292a74a88ac736019ab962ece0bc380e3f977bf72e376c5d78ff0678"
dependencies = [
 "cc",
]

[[package]]
name = "core-foundation"
version = "0.10.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "b2a6cd9ae233e7f62ba4e9353e81a88df7fc8a5987b8d445b4d90c879bd156f6"
dependencies = [
 "core-foundation-sys",
 "libc",
]

[[package]]
name = "core-foundation-sys"
version = "0.8.7"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "773648b94d0e5d620f64f280777445740e61fe701025087ec8b57f45c791888b"

[[package]]
name = "cpufeatures"
version = "0.2.17"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "59ed5838eebb26a2bb2e58f6d5b5316989ae9d08bab10e0e6d103e656d1b0280"
dependencies = [
 "libc",
]

[[package]]
name = "crossbeam-epoch"
version = "0.9.21"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "dc74980687109a3b14c72fd458107bf0baa1da1a1a805e178d15501ba9b86d9d"
dependencies = [
 "crossbeam-utils",
]

[[package]]
name = "crossbeam-utils"
version = "0.8.23"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "a31eee39dddec8330830986fcd7625edb5a24ec90ea038215273bbc3adb08ac6"

[[package]]
name = "crypto-common"
version = "0.1.7"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "78c8292055d1c1df0cce5d180393dc8cce0abec0a7102adb6c7b1eef6016d60a"
dependencies = [
 "generic-array",
 "typenum",
]

[[package]]
name = "data-encoding"
version = "2.11.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "4583a4551df46e2792f82ceeac45e850d2e2d5debba0b91f102385cda5b11f06"

[[package]]
name = "deranged"
version = "0.5.8"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "7cd812cc2bc1d69d4764bd80df88b4317eaef9e773c75226407d9bc0876b211c"
dependencies = [
 "serde_core",
]

[[package]]
name = "digest"
version = "0.10.7"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "9ed9a281f7bc9b7576e61468ba615a66a5c8cfdff42420a70aa82701a3b1e292"
dependencies = [
 "block-buffer",
 "crypto-common",
 "subtle",
]

[[package]]
name = "displaydoc"
version = "0.2.7"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "c6232dd377dcc64799954cbd3a9bb882e9cdc1308ccd87b1c098f1fb2eaf82a8"
dependencies = [
 "proc-macro2",
 "quote",
 "syn 3.0.5",
]

[[package]]
name = "dunce"
version = "1.0.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "92773504d58c093f6de2459af4af33faa518c13451eb8f2b5698ed3d36e7c813"

[[package]]
name = "equivalent"
version = "1.0.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "877a4ace8713b0bcf2a4e7eec82529c029f1d0619886d18145fea96c3ffe5c0f"

[[package]]
name = "errno"
version = "0.3.14"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "39cab71617ae0d63f51a36d69f866391735b51691dbda63cf6f96d042b63efeb"
dependencies = [
 "libc",
 "windows-sys 0.61.2",
]

[[package]]
name = "find-msvc-tools"
version = "0.1.12"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "3e0f1c7c3a72c66fd80abe965175f7523475c0489a87d3ff9d6e8c87d87a9d2d"

[[package]]
name = "fnv"
version = "1.0.7"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "3f9eec918d3f24069decb9af1554cad7c880e2da24a9afd88aca000531ab82c1"

[[package]]
name = "form_urlencoded"
version = "1.2.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "cb4cb245038516f5f85277875cdaa4f7d2c9a0fa0468de06ed190163b1581fcf"
dependencies = [
 "percent-encoding",
]

[[package]]
name = "fs_extra"
version = "1.3.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "42703706b716c37f96a77aea830392ad231f44c9e9a67872fa5548707e11b11c"

[[package]]
name = "futures-channel"
version = "0.3.34"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "b1f9e3d69d39e4862ffed03ed071a76f9a13ba1d9109d355b0f0aa6b15e393c4"
dependencies = [
 "futures-core",
]

[[package]]
name = "futures-core"
version = "0.3.34"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "92d699e522242e69e3003b94ecc1f960f3a5e015aa7c5d7486e65ad01dd94f5e"

[[package]]
name = "futures-sink"
version = "0.3.34"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "1944426bf7d03f1d14f708785e4b33efd750b36d48a157b836b3efc15ede8e1d"

[[package]]
name = "futures-task"
version = "0.3.34"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "cd417de3d1d015fc3bfd2b1ea46dfc7bab72ef86f1cc7cc9c78e728b34a6d1fd"

[[package]]
name = "futures-util"
version = "0.3.34"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "0d50a92467f8ba5dd6e3ee5d4bd04d73ab2e4e1c44474a0674821dfce14b79bc"
dependencies = [
 "futures-core",
 "futures-sink",
 "futures-task",
 "pin-project-lite",
 "slab",
]

[[package]]
name = "generic-array"
version = "0.14.7"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "85649ca51fd72272d7821adaf274ad91c288277713d9c18820d8499a7ff69e9a"
dependencies = [
 "typenum",
 "version_check",
]

[[package]]
name = "getrandom"
version = "0.2.17"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "ff2abc00be7fca6ebc474524697ae276ad847ad0a6b3faa4bcb027e9a4614ad0"
dependencies = [
 "cfg-if",
 "libc",
 "wasi",
]

[[package]]
name = "getrandom"
version = "0.4.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "300e883d756b2e4ec94e02791f39b04b522276138852cfc41d9fb7e904106099"
dependencies = [
 "cfg-if",
 "libc",
 "r-efi",
]

[[package]]
name = "h2"
version = "0.4.19"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "ef8e5e5a340588f4452631496976cf8636d4a7ecf600239fdc27615d2530bc16"
dependencies = [
 "atomic-waker",
 "bytes",
 "fnv",
 "futures-core",
 "futures-sink",
 "http",
 "indexmap",
 "slab",
 "tokio",
 "tokio-util",
 "tracing",
]

[[package]]
name = "hashbrown"
version = "0.14.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "e5274423e17b7c9fc20b6e7e208532f9b19825d82dfd615708b70edd83df41f1"
dependencies = [
 "ahash",
]

[[package]]
name = "hashbrown"
version = "0.17.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "ed5909b6e89a2db4456e54cd5f673791d7eca6732202bbf2a9cc504fe2f9b84a"

[[package]]
name = "hermit-abi"
version = "0.5.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "e17592d60ebacc7d5e169f4663c5f84f9161cc90328abcfe8456f41e4dfcb284"

[[package]]
name = "hex"
version = "0.4.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "7f24254aa9a54b5c858eaee2f5bccdb46aaf0e486a595ed5fd8f86ba55232a70"

[[package]]
name = "hmac"
version = "0.12.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "6c49c37c09c17a53d937dfbb742eb3a961d65a994e6bcdcf37e7399d0cc8ab5e"
dependencies = [
 "digest",
]

[[package]]
name = "http"
version = "1.5.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "918d3568bebf352712bc2ef3d46a8bcf1a75b373be6539de198e9105cbbf9ce0"
dependencies = [
 "bytes",
 "itoa",
]

[[package]]
name = "http-body"
version = "1.1.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "ca2a8f2913ee65f60facd6a5905613afaa448497a0230cc41ce022d93290bc2c"
dependencies = [
 "bytes",
 "http",
]

[[package]]
name = "http-body-util"
version = "0.1.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "23169fe34a5fbcdd3f3862e78fb9b6fccd5f02a6dc6f732547005d45631ce71c"
dependencies = [
 "bytes",
 "futures-core",
 "http",
 "http-body",
 "pin-project-lite",
]

[[package]]
name = "httparse"
version = "1.10.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "6dbf3de79e51f3d586ab4cb9d5c3e2c14aa28ed23d180cf89b4df0454a69cc87"

[[package]]
name = "httpdate"
version = "1.0.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "df3b46402a9d5adb4c86a0cf463f42e19994e3ee891101b1841f30a545cb49a9"

[[package]]
name = "hyper"
version = "1.11.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "27b501faa50e7a26c3d3560ca625132f4078a17771f4810baf70475ae48cbe43"
dependencies = [
 "atomic-waker",
 "bytes",
 "futures-channel",
 "futures-core",
 "h2",
 "http",
 "http-body",
 "httparse",
 "httpdate",
 "itoa",
 "pin-project-lite",
 "smallvec",
 "tokio",
 "want",
]

[[package]]
name = "hyper-rustls"
version = "0.27.9"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "33ca68d021ef39cf6463ab54c1d0f5daf03377b70561305bb89a8f83aab66e0f"
dependencies = [
 "http",
 "hyper",
 "hyper-util",
 "log",
 "rustls",
 "rustls-native-certs",
 "tokio",
 "tokio-rustls",
 "tower-service",
]

[[package]]
name = "hyper-util"
version = "0.1.20"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "96547c2556ec9d12fb1578c4eaf448b04993e7fb79cbaad930a656880a6bdfa0"
dependencies = [
 "bytes",
 "futures-channel",
 "futures-util",
 "http",
 "http-body",
 "hyper",
 "libc",
 "pin-project-lite",
 "socket2",
 "tokio",
 "tower-service",
 "tracing",
]

[[package]]
name = "icu_collections"
version = "2.3.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "fa68d21081c4a05d5a901a1c62add574c77048b6a1c67be3b50ce0b60d4ca513"
dependencies = [
 "displaydoc",
 "potential_utf",
 "utf8_iter",
 "yoke",
 "zerofrom",
 "zerovec",
]

[[package]]
name = "icu_locale_core"
version = "2.3.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "d56e28588da92eee5c3201a6eff33fabdd49b62269c8938d4ff050ce4d900deb"
dependencies = [
 "displaydoc",
 "litemap",
 "tinystr",
 "writeable",
 "zerovec",
]

[[package]]
name = "icu_normalizer"
version = "2.3.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "12f9cf5f235641ed274641dd81c3f28d870e276763d0797aeeab72317b1c646f"
dependencies = [
 "icu_collections",
 "icu_normalizer_data",
 "icu_properties",
 "icu_provider",
 "smallvec",
 "zerovec",
]

[[package]]
name = "icu_normalizer_data"
version = "2.3.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "1563da1ed3e0b3bf3d74c9b85917ac9c56464d2f57242270c09c9e752f8021a0"

[[package]]
name = "icu_properties"
version = "2.3.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "7e7ca276ad3145661a65914e6daf131ca5120cd3dcee8f8f3214b8875184a148"
dependencies = [
 "displaydoc",
 "icu_collections",
 "icu_locale_core",
 "icu_properties_data",
 "icu_provider",
 "zerotrie",
 "zerovec",
]

[[package]]
name = "icu_properties_data"
version = "2.3.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "e590f038c1464a96894fd6d10127e90a8be4509f56ff7ecef851b15cee0b7caa"

[[package]]
name = "icu_provider"
version = "2.3.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "d27bbb9d3abbefac45d55f647c9de1d44aafcd1186eb91879afef17c396c3e73"
dependencies = [
 "displaydoc",
 "icu_locale_core",
 "writeable",
 "yoke",
 "zerofrom",
 "zerotrie",
 "zerovec",
]

[[package]]
name = "idna"
version = "1.1.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "3b0875f23caa03898994f6ddc501886a45c7d3d62d04d2d90788d47be1b1e4de"
dependencies = [
 "idna_adapter",
 "smallvec",
 "utf8_iter",
]

[[package]]
name = "idna_adapter"
version = "1.2.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "cb68373c0d6620ef8105e855e7745e18b0d00d3bdb07fb532e434244cdb9a714"
dependencies = [
 "icu_normalizer",
 "icu_properties",
]

[[package]]
name = "indexmap"
version = "2.14.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "cc4e190f5d26ca7051642629da2c52fc03bde85a03197c99408dcd291734c855"
dependencies = [
 "equivalent",
 "hashbrown 0.17.1",
]

[[package]]
name = "ipnet"
version = "2.12.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "791930b43c0d5973160d90a8f3894509f2b273430f5c5c73b668636d0287c5c0"

[[package]]
name = "itoa"
version = "1.0.18"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "8f42a60cbdf9a97f5d2305f08a87dc4e09308d1276d28c869c684d7777685682"

[[package]]
name = "jobserver"
version = "0.1.35"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "1c00acbd29eabad4a2392fa0e921c874934dbbf4194312ad20f04a0ed67a3cb3"
dependencies = [
 "getrandom 0.4.3",
 "libc",
]

[[package]]
name = "js-sys"
version = "0.3.105"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "ce57d20d1ea864ce2ac172ab472d409214f4fd359f0b2a2775abdf522e2af99e"
dependencies = [
 "cfg-if",
 "futures-util",
 "wasm-bindgen",
]

[[package]]
name = "lazy_static"
version = "1.5.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "bbd2bcb4c963f2ddae06a2efc7e9f3591312473c50c6685e1f298068316e66fe"

[[package]]
name = "libc"
version = "0.2.189"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "3eaf3ede3fee6db1a4c2ee091bf8a8b4dccdc6d17f656fb07896ee72867612f2"

[[package]]
name = "litemap"
version = "0.8.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "47d9d19d1d6efa0109d2f65ff4c85cddd50bd572e5a00127ab10987290bcefae"

[[package]]
name = "lock_api"
version = "0.4.14"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "224399e74b87b5f3557511d98dff8b14089b3dadafcab6bb93eab67d3aace965"
dependencies = [
 "scopeguard",
]

[[package]]
name = "log"
version = "0.4.34"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "f9f8bd3e56ce4dfc153cf470fffbfa98c7620958b312ca5c3a4b8d5181fd13c6"

[[package]]
name = "matchers"
version = "0.2.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "d1525a2a28c7f4fa0fc98bb91ae755d1e2d1505079e05539e35bc876b5d65ae9"
dependencies = [
 "regex-automata",
]

[[package]]
name = "matchit"
version = "0.7.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "0e7465ac9959cc2b1404e8e2367b43684a6d13790fe23056cc8c6c5a6b7bcb94"

[[package]]
name = "memchr"
version = "2.8.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "cf8baf1c55e62ffcace7a9f06f4bd9cd3f0c4beb022d3b367256b91b87513d98"

[[package]]
name = "metrics"
version = "0.23.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "3045b4193fbdc5b5681f32f11070da9be3609f189a79f3390706d42587f46bb5"
dependencies = [
 "ahash",
 "portable-atomic",
]

[[package]]
name = "metrics-exporter-prometheus"
version = "0.15.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "b4f0c8427b39666bf970460908b213ec09b3b350f20c0c2eabcbba51704a08e6"
dependencies = [
 "base64",
 "http-body-util",
 "hyper",
 "hyper-rustls",
 "hyper-util",
 "indexmap",
 "ipnet",
 "metrics",
 "metrics-util",
 "quanta",
 "thiserror",
 "tokio",
 "tracing",
]

[[package]]
name = "metrics-util"
version = "0.17.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "4259040465c955f9f2f1a4a8a16dc46726169bca0f88e8fb2dbeced487c3e828"
dependencies = [
 "crossbeam-epoch",
 "crossbeam-utils",
 "hashbrown 0.14.5",
 "metrics",
 "num_cpus",
 "quanta",
 "sketches-ddsketch",
]

[[package]]
name = "mime"
version = "0.3.17"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "6877bb514081ee2a7ff5ef9de3281f14a4dd4bceac4c09388074a6b5df8a139a"

[[package]]
name = "mio"
version = "1.2.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "4b18443e9c262bfe8fa82f51666e2642c53393f7e5c27b3e1aeab922cff5b9d8"
dependencies = [
 "libc",
 "wasi",
 "windows-sys 0.61.2",
]

[[package]]
name = "nu-ansi-term"
version = "0.50.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "7957b9740744892f114936ab4a57b3f487491bbeafaf8083688b16841a4240e5"
dependencies = [
 "windows-sys 0.61.2",
]

[[package]]
name = "num-conv"
version = "0.2.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "521739c6d2bac4aa25192232afe6841231376b2b26d4d9fae5ecf8ca5772e441"

[[package]]
name = "num_cpus"
version = "1.17.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "91df4bbde75afed763b708b7eee1e8e7651e02d97f6d5dd763e89367e957b23b"
dependencies = [
 "hermit-abi",
 "libc",
]

[[package]]
name = "once_cell"
version = "1.21.4"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "9f7c3e4beb33f85d45ae3e3a1792185706c8e16d043238c593331cc7cd313b50"

[[package]]
name = "openssl-probe"
version = "0.2.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "7c87def4c32ab89d880effc9e097653c8da5d6ef28e6b539d313baaacfbafcbe"

[[package]]
name = "parking_lot"
version = "0.12.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "93857453250e3077bd71ff98b6a65ea6621a19bb0f559a85248955ac12c45a1a"
dependencies = [
 "lock_api",
 "parking_lot_core",
]

[[package]]
name = "parking_lot_core"
version = "0.9.12"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "2621685985a2ebf1c516881c026032ac7deafcda1a2c9b7850dc81e3dfcb64c1"
dependencies = [
 "cfg-if",
 "libc",
 "redox_syscall",
 "smallvec",
 "windows-link",
]

[[package]]
name = "percent-encoding"
version = "2.3.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "9b4f627cb1b25917193a259e49bdad08f671f8d9708acfd5fe0a8c1455d87220"

[[package]]
name = "pin-project-lite"
version = "0.2.17"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "a89322df9ebe1c1578d689c92318e070967d1042b512afbe49518723f4e6d5cd"

[[package]]
name = "pkg-config"
version = "0.3.34"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "f6b464fbc74e149a392436b17d523f769e057cb6877f6a5c4618bc6f11800548"

[[package]]
name = "portable-atomic"
version = "1.15.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "05c8b63e8d9609db387f0324918f81d68fe27748f084ef092fb35954d0539a85"

[[package]]
name = "potential_utf"
version = "0.1.6"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "d83eb9bc6d8e5cf568e7a1101d60ee05e81ed50ea106026f3d18deeb046d7661"
dependencies = [
 "zerovec",
]

[[package]]
name = "powerfmt"
version = "0.2.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "439ee305def115ba05938db6eb1644ff94165c5ab5e9420d1c1bcedbba909391"

[[package]]
name = "ppv-lite86"
version = "0.2.21"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "85eae3c4ed2f50dcfe72643da4befc30deadb458a9b590d720cde2f2b1e97da9"
dependencies = [
 "zerocopy",
]

[[package]]
name = "proc-macro2"
version = "1.0.107"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "985e7ec9bb745e6ce6535b544d84d6cd6f7ad8bd711c398938ae983b91a766d9"
dependencies = [
 "unicode-ident",
]

[[package]]
name = "quanta"
version = "0.12.6"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "f3ab5a9d756f0d97bdc89019bd2e4ea098cf9cde50ee7564dde6b81ccc8f06c7"
dependencies = [
 "crossbeam-utils",
 "libc",
 "once_cell",
 "raw-cpuid",
 "wasi",
 "web-sys",
 "winapi",
]

[[package]]
name = "quote"
version = "1.0.47"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "1fbf4db142a473a8d80c26bbf18454ed458bf8d26c8219c331daecfdbd079001"
dependencies = [
 "proc-macro2",
]

[[package]]
name = "r-efi"
version = "6.0.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "f8dcc9c7d52a811697d2151c701e0d08956f92b0e24136cf4cf27b57a6a0d9bf"

[[package]]
name = "rand"
version = "0.8.8"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "e058c7de0b26af77780c769414d6257830bb240f3c38477dbc2c16e5f54d6d4c"
dependencies = [
 "libc",
 "rand_chacha",
 "rand_core",
]

[[package]]
name = "rand_chacha"
version = "0.3.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "e6c10a63a0fa32252be49d21e7709d4d4baf8d231c2dbce1eaa8141b9b127d88"
dependencies = [
 "ppv-lite86",
 "rand_core",
]

[[package]]
name = "rand_core"
version = "0.6.4"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "ec0be4795e2f6a28069bec0b5ff3e2ac9bafc99e6a9a7dc3547996c5c816922c"
dependencies = [
 "getrandom 0.2.17",
]

[[package]]
name = "raw-cpuid"
version = "11.6.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "498cd0dc59d73224351ee52a95fee0f1a617a2eae0e7d9d720cc622c73a54186"
dependencies = [
 "bitflags",
]

[[package]]
name = "redox_syscall"
version = "0.5.18"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "ed2bf2547551a7053d6fdfafda3f938979645c44812fbfcda098faae3f1a362d"
dependencies = [
 "bitflags",
]

[[package]]
name = "regex-automata"
version = "0.4.18"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "ad8553b9b26413251cbf30e620595c7a41b3887f03da04579c0e6b0d6a06b4b2"
dependencies = [
 "aho-corasick",
 "memchr",
 "regex-syntax",
]

[[package]]
name = "regex-syntax"
version = "0.8.11"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "d6f6ff9a378485b298a5286656da665ba74413d36db0979633275d2e708145d4"

[[package]]
name = "ring"
version = "0.17.14"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "a4689e6c2294d81e88dc6261c768b63bc4fcdb852be6d1352498b114f61383b7"
dependencies = [
 "cc",
 "cfg-if",
 "getrandom 0.2.17",
 "libc",
 "untrusted",
 "windows-sys 0.52.0",
]

[[package]]
name = "rustls"
version = "0.23.44"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "6725596c3f2c3a0aef021139e145d4eafe314a6623e4680ca83852b2c67ab2ba"
dependencies = [
 "aws-lc-rs",
 "log",
 "once_cell",
 "rustls-pki-types",
 "rustls-webpki",
 "subtle",
 "zeroize",
]

[[package]]
name = "rustls-native-certs"
version = "0.8.4"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "dab5152771c58876a2146916e53e35057e1a4dfa2b9df0f0305b07f611fdea4d"
dependencies = [
 "openssl-probe",
 "rustls-pki-types",
 "schannel",
 "security-framework",
]

[[package]]
name = "rustls-pki-types"
version = "1.15.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "2f4925028c7eb5d1fcdaf196971378ed9d2c1c4efc7dc5d011256f76c99c0a96"
dependencies = [
 "zeroize",
]

[[package]]
name = "rustls-webpki"
version = "0.103.15"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "f3c3cf1d8b1e7d4927e2d154c3fcb02979afb9939629c62cd9048d4f07b60ac2"
dependencies = [
 "aws-lc-rs",
 "ring",
 "rustls-pki-types",
 "untrusted",
]

[[package]]
name = "rustversion"
version = "1.0.23"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "cf54715a573b99ac80df0bc206da022bcd442c974952c7b9720069370852e21f"

[[package]]
name = "ryu"
version = "1.0.23"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "9774ba4a74de5f7b1c1451ed6cd5285a32eddb5cccb8cc655a4e50009e06477f"

[[package]]
name = "schannel"
version = "0.1.29"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "91c1b7e4904c873ef0710c1f407dde2e6287de2bebc1bbbf7d430bb7cbffd939"
dependencies = [
 "windows-sys 0.61.2",
]

[[package]]
name = "scopeguard"
version = "1.2.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "94143f37725109f92c262ed2cf5e59bce7498c01bcc1502d7b9afe439a4e9f49"

[[package]]
name = "security-framework"
version = "3.7.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "b7f4bc775c73d9a02cde8bf7b2ec4c9d12743edf609006c7facc23998404cd1d"
dependencies = [
 "bitflags",
 "core-foundation",
 "core-foundation-sys",
 "libc",
 "security-framework-sys",
]

[[package]]
name = "security-framework-sys"
version = "2.17.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "6ce2691df843ecc5d231c0b14ece2acc3efb62c0a398c7e1d875f3983ce020e3"
dependencies = [
 "core-foundation-sys",
 "libc",
]

[[package]]
name = "serde"
version = "1.0.229"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "4148590afebada386688f18773da617792bf2ef03ffc1e4cbd2b1d45b023e0ba"
dependencies = [
 "serde_core",
 "serde_derive",
]

[[package]]
name = "serde_core"
version = "1.0.229"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "67dca2c9c51e58a4791a4b1ed58308b39c64224d349a935ab5039aa360942a48"
dependencies = [
 "serde_derive",
]

[[package]]
name = "serde_derive"
version = "1.0.229"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "e7a5d71263a5a7d47b41f6b3f06ba276f10cc18b0931f1799f710578e2309348"
dependencies = [
 "proc-macro2",
 "quote",
 "syn 3.0.5",
]

[[package]]
name = "serde_json"
version = "1.0.151"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "c841b55ecdae098c80dcae9cf767f6f8a0c2cdb3416bbef72181df4d0fe73f14"
dependencies = [
 "indexmap",
 "itoa",
 "memchr",
 "serde",
 "serde_core",
 "zmij",
]

[[package]]
name = "serde_path_to_error"
version = "0.1.20"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "10a9ff822e371bb5403e391ecd83e182e0e77ba7f6fe0160b795797109d1b457"
dependencies = [
 "itoa",
 "serde",
 "serde_core",
]

[[package]]
name = "serde_urlencoded"
version = "0.7.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "d3491c14715ca2294c4d6a88f15e84739788c1d030eed8c110436aafdaa2f3fd"
dependencies = [
 "form_urlencoded",
 "itoa",
 "ryu",
 "serde",
]

[[package]]
name = "sha1"
version = "0.10.7"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "a978451301f4db1d02937a4ab3ccce137717b81826e79b7d49ffe3244a13c3b8"
dependencies = [
 "cfg-if",
 "cpufeatures",
 "digest",
]

[[package]]
name = "sha2"
version = "0.10.9"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "a7507d819769d01a365ab707794a4084392c824f54a7a6a7862f8c3d0892b283"
dependencies = [
 "cfg-if",
 "cpufeatures",
 "digest",
]

[[package]]
name = "sharded-slab"
version = "0.1.7"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "f40ca3c46823713e0d4209592e8d6e826aa57e928f09752619fc696c499637f6"
dependencies = [
 "lazy_static",
]

[[package]]
name = "shlex"
version = "2.0.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "f8fadd59c855ef2080decdef8ff161eb6661b86933c9d82e5ba29dc602a55aba"

[[package]]
name = "signal-hook-registry"
version = "1.4.8"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "c4db69cba1110affc0e9f7bcd48bbf87b3f4fc7c61fc9155afd4c469eb3d6c1b"
dependencies = [
 "errno",
 "libc",
]

[[package]]
name = "sketches-ddsketch"
version = "0.2.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "85636c14b73d81f541e525f585c0a2109e6744e1565b5c1668e31c70c10ed65c"

[[package]]
name = "slab"
version = "0.4.12"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "0c790de23124f9ab44544d7ac05d60440adc586479ce501c1d6d7da3cd8c9cf5"

[[package]]
name = "smallvec"
version = "1.16.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "ba467056f1b547ed52077911161fc86985becbc60e8e1857c8a144dab0def891"

[[package]]
name = "socket2"
version = "0.6.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "c3d1e2c7f27f8d4cb10542a02c49005dbd6e93095799d6f3be745fae9f8fedd4"
dependencies = [
 "libc",
 "windows-sys 0.61.2",
]

[[package]]
name = "stable_deref_trait"
version = "1.2.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "6ce2be8dc25455e1f91df71bfa12ad37d7af1092ae736f3a6cd0e37bc7810596"

[[package]]
name = "subtle"
version = "2.6.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "13c2bddecc57b384dee18652358fb23172facb8a2c51ccc10d74c157bdea3292"

[[package]]
name = "sunbird-protocol"
version = "1.0.0"
dependencies = [
 "serde",
 "serde_json",
 "thiserror",
 "time",
 "uuid",
]

[[package]]
name = "sunbird-server"
version = "1.0.0"
dependencies = [
 "anyhow",
 "axum",
 "base64",
 "futures-util",
 "hex",
 "hmac",
 "http",
 "metrics",
 "metrics-exporter-prometheus",
 "parking_lot",
 "serde",
 "serde_json",
 "sha2",
 "sunbird-protocol",
 "thiserror",
 "time",
 "tokio",
 "tower",
 "tower-http",
 "tracing",
 "tracing-subscriber",
 "url",
 "uuid",
]

[[package]]
name = "syn"
version = "2.0.119"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "872831b642d1a07999a962a351ed35b955ea2cfc8f3862091e2a240a84f17297"
dependencies = [
 "proc-macro2",
 "quote",
 "unicode-ident",
]

[[package]]
name = "syn"
version = "3.0.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "12df2e0110f65b775f769bb17ef989067a1d931b2eb822bd4346631eeada89f9"
dependencies = [
 "proc-macro2",
 "quote",
 "unicode-ident",
]

[[package]]
name = "sync_wrapper"
version = "1.0.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "0bf256ce5efdfa370213c1dabab5935a12e49f2c58d15e9eac2870d3b4f27263"

[[package]]
name = "synstructure"
version = "0.13.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "728a70f3dbaf5bab7f0c4b1ac8d7ae5ea60a4b5549c8a5914361c99147a709d2"
dependencies = [
 "proc-macro2",
 "quote",
 "syn 2.0.119",
]

[[package]]
name = "thiserror"
version = "1.0.69"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "b6aaf5339b578ea85b50e080feb250a3e8ae8cfcdff9a461c9ec2904bc923f52"
dependencies = [
 "thiserror-impl",
]

[[package]]
name = "thiserror-impl"
version = "1.0.69"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "4fee6c4efc90059e10f81e6d42c60a18f76588c3d74cb83a0b242a2b6c7504c1"
dependencies = [
 "proc-macro2",
 "quote",
 "syn 2.0.119",
]

[[package]]
name = "thread_local"
version = "1.1.10"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "1ad99c4c6d32803332c548b1af0540b357b3f5fc0be8f6c6bfe8b2e6ae784070"
dependencies = [
 "cfg-if",
]

[[package]]
name = "time"
version = "0.3.55"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "cdb87b95ec50ddfa440816d227a17b2ccbdda963a316a727fda0fc4334f7d134"
dependencies = [
 "deranged",
 "num-conv",
 "powerfmt",
 "serde_core",
 "time-core",
 "time-macros",
]

[[package]]
name = "time-core"
version = "0.1.9"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "9e1c906769ad99c88eaa54e728060edef082f8e358ff32030cb7c7d315e81109"

[[package]]
name = "time-macros"
version = "0.2.32"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "7e689342a48d2ea927c87ea50cabf8594854bf940e9310208848d680d668ed85"
dependencies = [
 "num-conv",
 "time-core",
]

[[package]]
name = "tinystr"
version = "0.8.4"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "b1e27c91459209c2986af3dcf603a5a74a4368754ce37414f59acc971167f643"
dependencies = [
 "displaydoc",
 "zerovec",
]

[[package]]
name = "tokio"
version = "1.53.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "202caea871b69668250d242070849eb495be178ed697a3e98aebce5bc81a0bed"
dependencies = [
 "bytes",
 "libc",
 "mio",
 "pin-project-lite",
 "signal-hook-registry",
 "socket2",
 "tokio-macros",
 "windows-sys 0.61.2",
]

[[package]]
name = "tokio-macros"
version = "2.7.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "78773a2a397f451582ce068015985c33193cf6dea8b74d2a639fe457b2f07b0e"
dependencies = [
 "proc-macro2",
 "quote",
 "syn 3.0.5",
]

[[package]]
name = "tokio-rustls"
version = "0.26.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "b0c85f2c3ef0b1cd58b36682f4b17aaa995f0e5db534d85692b4903abce21f67"
dependencies = [
 "rustls",
 "tokio",
]

[[package]]
name = "tokio-tungstenite"
version = "0.24.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "edc5f74e248dc973e0dbb7b74c7e0d6fcc301c694ff50049504004ef4d0cdcd9"
dependencies = [
 "futures-util",
 "log",
 "tokio",
 "tungstenite",
]

[[package]]
name = "tokio-util"
version = "0.7.19"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "494815d09bf52b5548659851081238f0ca39ff638363907596da739561c62c52"
dependencies = [
 "bytes",
 "futures-core",
 "futures-sink",
 "libc",
 "pin-project-lite",
 "tokio",
]

[[package]]
name = "tower"
version = "0.5.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "ebe5ef63511595f1344e2d5cfa636d973292adc0eec1f0ad45fae9f0851ab1d4"
dependencies = [
 "futures-core",
 "futures-util",
 "pin-project-lite",
 "sync_wrapper",
 "tokio",
 "tower-layer",
 "tower-service",
 "tracing",
]

[[package]]
name = "tower-http"
version = "0.6.11"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "4cfcf7e2740e6fc6d4d688b4ef00650406bb94adf4731e43c096c3a19fe40840"
dependencies = [
 "bitflags",
 "bytes",
 "http",
 "http-body",
 "http-body-util",
 "pin-project-lite",
 "tokio",
 "tower-layer",
 "tower-service",
 "tracing",
]

[[package]]
name = "tower-layer"
version = "0.3.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "121c2a6cda46980bb0fcd1647ffaf6cd3fc79a013de288782836f6df9c48780e"

[[package]]
name = "tower-service"
version = "0.3.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "8df9b6e13f2d32c91b9bd719c00d1958837bc7dec474d94952798cc8e69eeec3"

[[package]]
name = "tracing"
version = "0.1.44"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "63e71662fa4b2a2c3a26f570f037eb95bb1f85397f3cd8076caed2f026a6d100"
dependencies = [
 "log",
 "pin-project-lite",
 "tracing-attributes",
 "tracing-core",
]

[[package]]
name = "tracing-attributes"
version = "0.1.31"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "7490cfa5ec963746568740651ac6781f701c9c5ea257c58e057f3ba8cf69e8da"
dependencies = [
 "proc-macro2",
 "quote",
 "syn 2.0.119",
]

[[package]]
name = "tracing-core"
version = "0.1.36"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "db97caf9d906fbde555dd62fa95ddba9eecfd14cb388e4f491a66d74cd5fb79a"
dependencies = [
 "once_cell",
 "valuable",
]

[[package]]
name = "tracing-log"
version = "0.2.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "ee855f1f400bd0e5c02d150ae5de3840039a3f54b025156404e34c23c03f47c3"
dependencies = [
 "log",
 "once_cell",
 "tracing-core",
]

[[package]]
name = "tracing-serde"
version = "0.2.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "704b1aeb7be0d0a84fc9828cae51dab5970fee5088f83d1dd7ee6f6246fc6ff1"
dependencies = [
 "serde",
 "tracing-core",
]

[[package]]
name = "tracing-subscriber"
version = "0.3.23"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "cb7f578e5945fb242538965c2d0b04418d38ec25c79d160cd279bf0731c8d319"
dependencies = [
 "matchers",
 "nu-ansi-term",
 "once_cell",
 "regex-automata",
 "serde",
 "serde_json",
 "sharded-slab",
 "smallvec",
 "thread_local",
 "time",
 "tracing",
 "tracing-core",
 "tracing-log",
 "tracing-serde",
]

[[package]]
name = "try-lock"
version = "0.2.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "e421abadd41a4225275504ea4d6566923418b7f05506fbc9c0fe86ba7396114b"

[[package]]
name = "tungstenite"
version = "0.24.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "18e5b8366ee7a95b16d32197d0b2604b43a0be89dc5fac9f8e96ccafbaedda8a"
dependencies = [
 "byteorder",
 "bytes",
 "data-encoding",
 "http",
 "httparse",
 "log",
 "rand",
 "sha1",
 "thiserror",
 "utf-8",
]

[[package]]
name = "typenum"
version = "1.20.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "b6f5e870be6c3b371b77fe0ee0bafb859fa4964b4404c27de1d380043c4dda20"

[[package]]
name = "unicode-ident"
version = "1.0.24"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "e6e4313cd5fcd3dad5cafa179702e2b244f760991f45397d14d4ebf38247da75"

[[package]]
name = "untrusted"
version = "0.9.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "8ecb6da28b8a351d773b68d5825ac39017e680750f980f3a1a85cd8dd28a47c1"

[[package]]
name = "url"
version = "2.5.8"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "ff67a8a4397373c3ef660812acab3268222035010ab8680ec4215f38ba3d0eed"
dependencies = [
 "form_urlencoded",
 "idna",
 "percent-encoding",
 "serde",
]

[[package]]
name = "utf-8"
version = "0.7.6"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "09cc8ee72d2a9becf2f2febe0205bbed8fc6615b7cb429ad062dc7b7ddd036a9"

[[package]]
name = "utf8_iter"
version = "1.0.4"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "b6c140620e7ffbb22c2dee59cafe6084a59b5ffc27a8859a5f0d494b5d52b6be"

[[package]]
name = "uuid"
version = "1.26.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "2ef6dac1e96601b4fb3acccccff2139741fcb757cb9a36089bf5be91cfb285ce"
dependencies = [
 "getrandom 0.4.3",
 "js-sys",
 "serde_core",
 "wasm-bindgen",
]

[[package]]
name = "valuable"
version = "0.1.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "ba73ea9cf16a25df0c8caa16c51acb937d5712a8429db78a3ee29d5dcacd3a65"

[[package]]
name = "version_check"
version = "0.9.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "0b928f33d975fc6ad9f86c8f283853ad26bdd5b10b7f1542aa2fa15e2289105a"

[[package]]
name = "want"
version = "0.3.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "bfa7760aed19e106de2c7c0b581b509f2f25d3dacaf737cb82ac61bc6d760b0e"
dependencies = [
 "try-lock",
]

[[package]]
name = "wasi"
version = "0.11.1+wasi-snapshot-preview1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "ccf3ec651a847eb01de73ccad15eb7d99f80485de043efb2f370cd654f4ea44b"

[[package]]
name = "wasm-bindgen"
version = "0.2.128"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "aecb87a33d3b0c5e3b7aa46336eaf486cffafbd281b195e4c8b80d50df2351bf"
dependencies = [
 "cfg-if",
 "once_cell",
 "rustversion",
 "wasm-bindgen-macro",
 "wasm-bindgen-shared",
]

[[package]]
name = "wasm-bindgen-macro"
version = "0.2.128"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "a690d511e3c1a8b3a55e33511e3c2c00c78415cd23650f32b808627f5696b9ed"
dependencies = [
 "quote",
 "wasm-bindgen-macro-support",
]

[[package]]
name = "wasm-bindgen-macro-support"
version = "0.2.128"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "411e4887f0071ef2d2164a9d5fdf2d20efbef78fccd3a78b0c10a1dc5295e48a"
dependencies = [
 "bumpalo",
 "proc-macro2",
 "quote",
 "syn 3.0.5",
 "wasm-bindgen-shared",
]

[[package]]
name = "wasm-bindgen-shared"
version = "0.2.128"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "81941cd78d0c92026c33e5e01312845a4cb1e9af3407f9134b100dd03144103e"
dependencies = [
 "unicode-ident",
]

[[package]]
name = "web-sys"
version = "0.3.105"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "9fbddc4a036f00ec4f18c83445bd3115cb306a91da554919a099d9222fe4a7f8"
dependencies = [
 "js-sys",
 "wasm-bindgen",
]

[[package]]
name = "winapi"
version = "0.3.9"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "5c839a674fcd7a98952e593242ea400abe93992746761e38641405d28b00f419"
dependencies = [
 "winapi-i686-pc-windows-gnu",
 "winapi-x86_64-pc-windows-gnu",
]

[[package]]
name = "winapi-i686-pc-windows-gnu"
version = "0.4.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "ac3b87c63620426dd9b991e5ce0329eff545bccbbb34f3be09ff6fb6ab51b7b6"

[[package]]
name = "winapi-x86_64-pc-windows-gnu"
version = "0.4.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "712e227841d057c1ee1cd2fb22fa7e5a5461ae8e48fa2ca79ec42cfc1931183f"

[[package]]
name = "windows-link"
version = "0.2.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "f0805222e57f7521d6a62e36fa9163bc891acd422f971defe97d64e70d0a4fe5"

[[package]]
name = "windows-sys"
version = "0.52.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "282be5f36a8ce781fad8c8ae18fa3f9beff57ec1b52cb3de0789201425d9a33d"
dependencies = [
 "windows-targets",
]

[[package]]
name = "windows-sys"
version = "0.61.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "ae137229bcbd6cdf0f7b80a31df61766145077ddf49416a728b02cb3921ff3fc"
dependencies = [
 "windows-link",
]

[[package]]
name = "windows-targets"
version = "0.52.6"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "9b724f72796e036ab90c1021d4780d4d3d648aca59e491e6b98e725b84e99973"
dependencies = [
 "windows_aarch64_gnullvm",
 "windows_aarch64_msvc",
 "windows_i686_gnu",
 "windows_i686_gnullvm",
 "windows_i686_msvc",
 "windows_x86_64_gnu",
 "windows_x86_64_gnullvm",
 "windows_x86_64_msvc",
]

[[package]]
name = "windows_aarch64_gnullvm"
version = "0.52.6"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "32a4622180e7a0ec044bb555404c800bc9fd9ec262ec147edd5989ccd0c02cd3"

[[package]]
name = "windows_aarch64_msvc"
version = "0.52.6"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "09ec2a7bb152e2252b53fa7803150007879548bc709c039df7627cabbd05d469"

[[package]]
name = "windows_i686_gnu"
version = "0.52.6"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "8e9b5ad5ab802e97eb8e295ac6720e509ee4c243f69d781394014ebfe8bbfa0b"

[[package]]
name = "windows_i686_gnullvm"
version = "0.52.6"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "0eee52d38c090b3caa76c563b86c3a4bd71ef1a819287c19d586d7334ae8ed66"

[[package]]
name = "windows_i686_msvc"
version = "0.52.6"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "240948bc05c5e7c6dabba28bf89d89ffce3e303022809e73deaefe4f6ec56c66"

[[package]]
name = "windows_x86_64_gnu"
version = "0.52.6"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "147a5c80aabfbf0c7d901cb5895d1de30ef2907eb21fbbab29ca94c5b08b1a78"

[[package]]
name = "windows_x86_64_gnullvm"
version = "0.52.6"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "24d5b23dc417412679681396f2b49f3de8c1473deb516bd34410872eff51ed0d"

[[package]]
name = "windows_x86_64_msvc"
version = "0.52.6"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "589f6da84c646204747d1270a2a5661ea66ed1cced2631d546fdfb155959f9ec"

[[package]]
name = "writeable"
version = "0.6.4"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "3ad82d2a33cdc9674dc7465672f271e096168fcdbe0f799d9e6db8c5892679dc"

[[package]]
name = "yoke"
version = "0.8.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "709fe23a0424b6a435d82152b1bd3fdfb0833487d5fa90d05d42762a9891fef5"
dependencies = [
 "stable_deref_trait",
 "yoke-derive",
 "zerofrom",
]

[[package]]
name = "yoke-derive"
version = "0.8.2"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "de844c262c8848816172cef550288e7dc6c7b7814b4ee56b3e1553f275f1858e"
dependencies = [
 "proc-macro2",
 "quote",
 "syn 2.0.119",
 "synstructure",
]

[[package]]
name = "zerocopy"
version = "0.8.57"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "d35102a9f36d089ccae9e4c6802bc118be4487b80aaffc0ab4e0cf5ce92d2873"
dependencies = [
 "zerocopy-derive",
]

[[package]]
name = "zerocopy-derive"
version = "0.8.57"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "146c01f5ab44258da43cf276c74a2763db2ff3969c9c652c3f2de07041d0b2bc"
dependencies = [
 "proc-macro2",
 "quote",
 "syn 2.0.119",
]

[[package]]
name = "zerofrom"
version = "0.1.8"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "0ec05a11813ea801ff6d75110ad09cd0824ddba17dfe17128ea0d5f68e6c5272"
dependencies = [
 "zerofrom-derive",
]

[[package]]
name = "zerofrom-derive"
version = "0.1.7"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "11532158c46691caf0f2593ea8358fed6bbf68a0315e80aae9bd41fbade684a1"
dependencies = [
 "proc-macro2",
 "quote",
 "syn 2.0.119",
 "synstructure",
]

[[package]]
name = "zeroize"
version = "1.9.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "e13c156562582aa81c60cb29407084cdb54c4164760106ab78e6c5b0858cf64e"

[[package]]
name = "zerotrie"
version = "0.2.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "4ea269c3bd32f0a32c321907a2ae912ba6f4649bb0fc764a15627e99a7095a3f"
dependencies = [
 "displaydoc",
 "yoke",
 "zerofrom",
]

[[package]]
name = "zerovec"
version = "0.11.8"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "bb0464e17806c1d976d5cba29399c7f08e516e279e2ba493f63123b5fca67dd8"
dependencies = [
 "yoke",
 "zerofrom",
 "zerovec-derive",
]

[[package]]
name = "zerovec-derive"
version = "0.11.6"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "34df6fc39dbd26ddc9c10e6a2984476e13acce22e64e4487636ef494369225da"
dependencies = [
 "proc-macro2",
 "quote",
 "syn 3.0.5",
]

[[package]]
name = "zmij"
version = "1.0.23"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "29666d0abbfad1e3dc4dcf6144730dd3a3ab225bbbdac83319345b1b44ccfc1b"
