# Sunbird — Handoff Document

_Last verified: 2026-09-16 · commit `arena/01a0a95f-sunbird` · full gate green · all 8 CI checks green_

Sunbird is a one-button arcade glider (procedural islands, hold-to-dive). Single codebase,
five build targets, one shared game core.

---

## 1. Build & run

```bash
pnpm install
pnpm dev                 # Vite on :5173 (pnpm via corepack: `corepack enable` once)
pnpm test                # 929 unit suites (Vitest, jsdom)
pnpm typecheck           # tsc --noEmit
pnpm build:portals       # dist-poki / dist-crazy / dist-generic + the three submission zips
pnpm build:itch          # dist-itch (single-file)
node scripts/verify-portal.mjs   # shippability gate on the zips (8 MB Poki budget, etc.)
node scripts/audit-zips.mjs      # forensic zip audit (bundle separation, URL inventory)
node scripts/verify-prod.mjs     # production gate (lint+typecheck+tests+build, budgets, debug-artifact ban)
```

### Build targets (`VITE_PORTAL_TARGET`)

| Target | What it ships | Notes |
|---|---|---|
| `poki` | Poki SDK only; multiplayer/leaderboard/telemetry/social/Stripe URLs all blanked | coin economy only; localStorage save |
| `crazy` | CrazyGames SDK v3 (banner container `VITE_CRAZY_BANNER_ID`) | same blanking |
| `generic` | no SDK; portal-safe restrictions still apply | for itch.io, GameDistribution, Yandex… |
| `vercel` (default) | full social build: WS multiplayer, leaderboard, social server | needs the backend env vars |
| `itch` (`VITE_SINGLEFILE`) | one self-contained HTML file | |

The SDK script URL for each portal ships in **every** bundle as an inert string literal;
only the build target's URL is ever injected (enforced by `scripts/verify-portal.mjs`).

## 2. Architecture (honest version)

```
src/
  boot.ts            rejection guard + SW retirement (portal builds never register SWs)
  App.tsx            React shell: mounts Game into the canvas host
  game/
    Game.ts          the game (state machine: menu/playing/paused/continue/ad/gameover)
    HUD.ts           DOM HUD — full re-render only on snapshot-key change; per-frame
                     elements (standings ticker, nametags) are keyed/element-reused
    MassRace.ts      the 40-rival PVP field (AI, draft, knockouts, remote promotion)
    Realtime.ts      WS client (lobby/race frames, 120 ms interp, emotes, places)
    Music.ts         procedural score engine (26 tracks: 6 arcade-chiptune + 20 island)
    SaveData.ts      versioned localStorage save (single source of truth for progress)
    sdk/
      platform.ts    PORT: the PlatformAdapter interface + SDK bootstrap (6 s timeout,
                     never-fail boot, late init — first frame never waits on a CDN)
      poki.ts        ADAPTER: full Poki SDK surface
      crazygames.ts  ADAPTER: CrazyGames SDK v3 surface
      local.ts       ADAPTER: no-op platform + localStorage cloud fallback
  server/ (Node ref), rust/ (authoritative DO) — the multiplayer referee (NOT in portal builds)
  scripts/           verify-portal / audit-zips / verify-prod / package-portal / botsim
```

**The platform boundary is already ports-and-adapters** (`sdk/platform.ts` is the port;
poki/crazy/local are adapters). A full "hexagonal" rewrite of the game core itself would
mean moving ~50k lines of a shipped, green, pre-submission codebase for zero player-facing
value and maximum regression risk — that is the opposite of KISS, and it is deliberately
NOT done. The seam that matters for portal handoff (the only boundary a portal cares about)
is already clean and tested.

## 3. Performance (measured, with regression guards)

Frame budget: 8.3 ms (120 Hz physics + render). Guards live in the test suite and fail CI
if these regress:

| Guard | Budget | Measured (CI Node) |
|---|---|---|
| Player physics step | < 20 µs/step (`physics-perf.test.ts`) | ~3.5 µs |
| **40-rival PVP field** | < 4 ms/frame (`massrace-perf.test.ts`) | **0.12 ms** (was 0.17) |
| **standings + roster + nametags** | < 0.5 ms/triple | **33 µs** (was 57) |
| Total JS | < 2.5 MB (`verify-prod.mjs`) | 1.40 MB |

PVP-specific optimizations (2026-09-16):
- **Tiered AI fidelity** — rivals >300 m behind the player dead-reckon on alternate frames
  (off-camera; no interaction possible; finishes still detected). Front-of-pack rivals and
  everything ahead of the player always run full rate.
- **Nametag DOM reuse** — per-frame `innerHTML` re-parse eliminated; positions are style
  writes, content re-parses only when rank/name/emote/draft changes.
- **No per-frame standings sort in the nametag path** — place is computed by counting.
- **Snapshot gating** — `lobbyRivals`/`roomRivals` computed only on the lobby screen.
- **End-of-race pileup fixed** — the rival pack is hidden the moment the run ends
  (was drawn frozen behind the results card); post-finish remote "X finished Pn" toasts
  (up to 40, each a full results-card re-render) now fire only while still racing.

## 4. Portal compliance (Poki)

`POKI_COMPLIANCE_AUDIT.md` is the full rule-by-rule audit (all PASS as of this commit).
Re-verified against the current Poki docs (developers.poki.com, 2026-09-16):

- **Event sequences** match the documented table exactly (startup, death→restart,
  death→revive, pause→resume), and the `GameplayEventSink` guarantees the
  "no consecutive duplicate events" rule.
- `gameLoadingFinished()` is now one-shot in the Poki adapter (previously `loadingFinished`
  + `signalGameReady` fired it twice in a row).
- `gameplayStart()` fires on first input, not on load (requirement met by the state machine).
- **`PokiSDK.login()`** exists in the current API (page-reloads on first login; resolves
  instantly if already logged in). We deliberately do NOT prompt at boot — `getUser()` is
  polled passively and the pilot name falls back to the local generated/custom name.
  Optional follow-up: a "Sign in with Poki" button on the profile screen (calls
  `login()` on user action, then `getUser()`).
- **poki-cli** (github.com/poki/poki-cli) can upload builds from CI — not wired yet;
  Inspector folder upload works today.
- `getToken()` returns a valid long-lived JWT in Inspector debug mode — the backend
  verification endpoint is the only consumer (1-minute JWT on production; never stored).

**Submission checklist (human steps, not code):**
1. Upload the **unzipped** `sunbird-poki.zip` folder to the [Poki Inspector](https://inspector.poki.dev/) —
   walk the Event Log (all S-sequences), Desktop + Mobile QR + scaling tests.
2. Upload static + animated thumbnails.
3. Confirm **web exclusivity** for the Poki build at submission (the `generic` zip is a
   separate artifact, which is what makes the pledge possible).
4. Keep the social/WS build out of the Poki artifact (already true — bundle-verified).
5. Post-launch: AUDS (cross-device save), Netlib (portal multiplayer), optional `login()` button.

## 5. Recent significant work (git log, newest first)

- `e42ae0d` PVP end-of-race pileup fix + visible emotes (over-head nametag emotes, flight-only emote wheel) + `pvp-end-audit.test.ts`
- `e194654` 6 new procedural arcade-chiptune tracks (bouncy 8-bit family; picker tracks 1–6; island family untouched)
- `b247cdd` main-menu background = live 3D gameplay world (attract flight), hero bird removed, fullscreen button removed, cream card
- earlier: full Poki compliance audit + fixes (event sink, pause→resume through commercialBreak, tablet→mobile controls, dual-currency removal)

## 6. Test gate (what "ready" means)

- `pnpm test` — 929 tests: unit (jsdom), deterministic-sim (same seed ⇒ bit-identical player
  physics), network-boundary (hostile frames), PVP end-of-race audit, perf guards.
- `pnpm test:server` + `pnpm typecheck:server` — Node reference server.
- Rust DO + botsim: 40-bot races vs both servers (CI).
- e2e (Playwright): menu journeys, layouts, multiplayer rooms (needs a browser; CI runs it).
- Portal zips: `verify-portal.mjs` + `audit-zips.mjs` (both PASS on this commit).

## 7. Known limitations (honest list)

- AI rival emotes are generated locally per client (two players see different AI emotes) —
  fixing needs server-side AI emotes; cosmetic only.
- Cloud save on portals is wrapped localStorage (no Poki AUDS yet) — cross-device saves
  are a post-launch item.
- Portal multiplayer is deferred (Poki Netlib / external-server approval) — the social
  build is separate and works independently.
- No headless browser in the dev sandbox — runtime verification there is unit + e2e-in-CI +
  Inspector. If a device-specific issue is reported, reproduce in the Inspector first.

## 8. File map (the 10 files that matter)

| File | Why you'd touch it |
|---|---|
| `src/game/Game.ts` | state machine, all gameplay, race/pvp flow, snapshot |
| `src/game/HUD.ts` | every piece of DOM UI (snapshot-keyed re-render) |
| `src/game/MassRace.ts` | the PVP rival field |
| `src/game/Realtime.ts` | WS protocol client |
| `src/game/Music.ts` | procedural music (track data + synthesis) |
| `src/game/SaveData.ts` | save schema (version it when changing) |
| `src/sdk/platform.ts` | platform port + SDK bootstrap |
| `src/sdk/poki.ts` | Poki adapter |
| `scripts/verify-portal.mjs` | the shippability gate |
| `POKI_COMPLIANCE_AUDIT.md` | the compliance record |
