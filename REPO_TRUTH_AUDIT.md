# SUNBIRD Repository Truth Audit

Audit scope: **M1 only**. Refreshed after explicit Phase 0/1 planning. This document records repository state and locally observed evidence. It does not claim staging, portal, security, load, Docker, CI, or Rust verification.

Canonical migration decisions and the phased implementation/rollback plan are documented in `RUST_MIGRATION_PLAN.md`. No Rust implementation existed at the refresh point.

## Executive Status

| Subsystem | Status | Evidence |
| --- | --- | --- |
| Browser client | **PARTIAL** | Vite production bundle completed locally. No clean-install, typecheck, lint, automated test, browser smoke, or device test evidence exists in the repository. |
| Core flight physics | **PARTIAL** | Fixed-step client implementation and a `scripts/physcheck.ts` harness exist. The harness is not registered as a package script and was not executable through the available M1 build gate. |
| Local 40-bird race | **PARTIAL** | `MassRace.ts` runs local physics pilots and is wired into `Game.ts`. Runtime/browser performance is unverified in this audit. |
| Realtime client | **PARTIAL** | `Realtime.ts` is wired through `MassRace.attachTransport()`. Server start synchronization, reconnect seat ownership, and authoritative results are not correctly enforced end-to-end. |
| Authoritative Rust service | **BROKEN / ABSENT** | Repository-wide `**/Cargo.toml` search returned zero files. There is no Rust source or Cargo workspace. |
| Node realtime reference service | **EXPERIMENTAL / DEPRECATED for production** | `server/sunbird-server.mjs` exists only as a protocol reference; it imports undeclared `ws`, is not part of the Rust production artifact, and must not be used for deployment. |
| Leaderboard | **PARTIAL / UNTRUSTED ONLINE PATH** | Client local fallback works by design; HTTP submission is wired. The server accepts client-submitted scores without authentication or authoritative validation. |
| Tournaments and prizes | **PARTIAL / CLIENT-AUTHORITATIVE** | Weekly cups and cosmetic rewards exist, but score submission and reward claims mutate local state on the client. |
| Save/profile/inventory | **PARTIAL** | Versioned localStorage state, migration defaults, cosmetics, boosts, quests, and import/export exist. No server ownership, schema migration tooling, signing, or tamper resistance exists. |
| Portal adapters | **PARTIAL / UNVERIFIED** | Poki and CrazyGames adapter code is wired to gameplay/ad lifecycle. No portal sandbox evidence exists. CrazyGames banner method is unused. |
| Direct payments | **BROKEN for real entitlement security** | Stripe Payment Links are configurable, but manual confirmation grants entitlements locally without webhook verification. Demo checkout is intentionally mock behavior. |
| PWA/offline | **BROKEN** | Manifest/service worker reference icon files missing from `public/icons`; only `icon-512.png` exists. Cache version is static (`sunbird-shell-v2`). |
| CI | **ABSENT** | `.github/workflows/*` search returned zero files. |
| Docker | **ABSENT** | `**/Dockerfile*` search returned zero files. |
| Metrics/operations | **PARTIAL** | Node server has `/health`; no `/metrics`, structured logs, readiness probe, graceful shutdown, or persistence. |
| Release readiness | **NOT READY** | Buildable browser bundle, but the production multiplayer, trusted ranking/reward flow, clean install reproducibility, operations, and portal validation gates are unresolved. |

## Repository Entrypoints

### Browser client

- HTML: `index.html`
- Vite/React bootstrap: `src/main.tsx`
- Application mount and WebGL failure boundary: `src/App.tsx`
- Main game/state-machine runtime: `src/game/Game.ts`
- Rendering/physics: `Bird.ts`, `TerrainSystem.ts`, `CameraRig.ts`, `Sky.ts`, `ParticleFX.ts`, `Collectibles.ts`, `Weather.ts`
- UI: `HUD.ts`, `src/index.css`, `src/game/ui.css`

### Realtime and multiplayer

- Client WebSocket transport: `src/game/Realtime.ts`
- Local/remote 40-bird field: `src/game/MassRace.ts`
- Local two-player split screen: `src/game/Racer.ts`
- Current backend reference: `server/sunbird-server.mjs`
- **No Rust backend exists in this repository.**

### Ranking, tournaments, rewards

- Leaderboard client/fallback: `src/game/Leaderboard.ts`
- Tournament schedule and local prize claims: `src/game/Tournaments.ts`
- Progression: `SeasonPass.ts`, `Missions.ts`, `Achievements.ts`, `Engagement.ts`
- Save/profile/inventory: `src/game/SaveData.ts`
- Economy/direct payment: `Economy.ts`, `Payments.ts`

### Portal integration

- `src/sdk/platform.ts`
- Build selection: `VITE_PORTAL_TARGET=none|poki|crazy`
- Documentation: `PORTAL_PUBLISHING.md`

## Canonical Multiplayer Direction

The architecture constraint establishes **Rust authoritative WebSocket service** as the canonical production path. That path is currently **absent**, so it cannot be called implemented or verified.

| Existing path | Classification | Disposition |
| --- | --- | --- |
| Rust authoritative service | **Canonical production path; absent** | Must be added and verified in a later milestone. |
| `server/sunbird-server.mjs` | **Experimental reference** | Useful protocol prototype; not production-authoritative and not clean-install runnable. Keep only as protocol/test reference until Rust reaches parity, then remove or clearly archive. |
| `Realtime.ts` | **Canonical client transport candidate** | Preserve the protocol-facing client, but harden it against the eventual Rust protocol. |
| `MassRace.ts` local pilots | **Offline/practice fallback** | Keep, with explicit bot/squadron labeling. Never count local bots as real online users. |
| `Racer.ts` split-screen | **Separate local multiplayer mode** | Keep; it is not a substitute for online multiplayer. |

No alternative database, WebTransport, Redis fan-out, or orchestration stack is selected in M1.

## What Exists

- TypeScript strict configuration with `noUnusedLocals` and `noUnusedParameters`.
- Vite single-file client build.
- Three.js rendering and fixed 120 Hz client physics.
- Daily deterministic terrain, multiple biomes, weather, collectibles, power-ups, music, particles, dynamic camera, and local persistence.
- Local split screen and a mixed local/remote 40-bird field.
- WebSocket client with interpolation buffers and reconnect attempts.
- Node room service prototype with room capacity, packed state broadcasts, finish message ordering, `/health`, and in-memory leaderboard endpoints.
- Leaderboard UI that honestly labels local fallback versus configured online mode.
- Portal adapter abstraction for Poki/CrazyGames with direct-build fallback.
- Portal-mode checks that suppress several direct purchase entrypoints.
- Service worker and web manifest.

## Wired But Unverified

- Browser boot, rendering, controls, audio unlock, save migration, all game modes, local split screen, and 40-bird runtime behavior.
- Portal SDK initialization, ad callbacks, mute/input gating, lifecycle calls, and portal-specific monetization suppression.
- Realtime reconnect behavior, interpolation quality, room joining, emotes, packed state delivery, and 40-user capacity.
- Stripe redirect flow and return handling.
- Global leaderboard endpoint compatibility.
- PWA installation/offline update behavior.
- Performance claims on desktop/mobile hardware.

These are **not** failures by default; they are unverified because this repository has no automated tests or captured browser/portal/staging evidence.

## Dead Or Unconsumed Code

Search-based findings:

- `PlatformAdapter.mountBanner()` has implementations but no caller.
- `RealtimeClient.sendReady()` has no caller.
- `RealtimeClient.roster()` has no caller.
- Realtime `startsAt` / `RoomInfo.startsInMs` are stored/exposed but not used to gate `Game` physics.
- Server `ready` state is broadcast but does not control race start.

These should be wired with tests or removed in M2; leaving them gives a misleading impression of completed flows.

## Duplicate Or Competing Systems

- **Ads:** portal SDK ads and `MockAdProvider`/fake standalone ad state coexist. Build-time portal checks reduce exposure, but both implementations remain in the shipped client graph.
- **Payments:** Stripe Payment Links and `MockPaymentProvider` coexist. This is appropriate only if demo behavior cannot grant production entitlements.
- **Leaderboard:** local benchmark board and HTTP global board share UI. Labeling is honest, but server trust is not.
- **Multiplayer:** local 40-bird simulation and remote WebSocket snapshots intentionally share `MassRace`; local split-screen is a third, separate mode.
- **Backend direction:** requested Rust canonical service versus actual Node prototype. This is the largest architecture truth gap.

## Misleading “Complete” Or “Authoritative” Labels

### Node server finish ordering

`server/sunbird-server.mjs` calls finish ordering authoritative, but it trusts a client `finish` message containing client-supplied `time` and `distance`. It does not enforce:

- that server start time was reached;
- that the pilot crossed the finish distance;
- plausible movement/velocity bounds;
- monotonic distance;
- a signed/reconnect-safe session identity.

The server is authoritative only over **message arrival order**, not race validity.

### Server-time synchronized starts

The server sends `{ type: "start", at, seed }`, and the client stores `startsAt`, but `Game.startRun()` begins gameplay before that signal and never gates simulation on `startsInMs`. Synchronized starts are therefore **not implemented end-to-end**.

### Reconnect-safe sessions

The client retries with the same query-string device id. The server stores pilots by that id but issues no signed seat token. A second connection can replace the map entry; the old socket’s close handler can then delete the replacement. Reconnect-safe seat ownership is **not established**.

### Leaderboards

`POST /score` accepts client values after simple numeric caps. It does not authenticate or derive results from a server-owned race. Global competitive integrity is therefore **not authoritative**.

### Tournaments and virtual prizes

Cup scores and prize claims are computed and persisted on the client. This is acceptable for offline progression but violates the stated rule for competitive/global rewards.

### Stripe fulfillment

`confirmManual()` immediately creates a local receipt and grants entitlement after “I’ve completed payment.” A real purchase requires server webhook verification and server-owned entitlement state. The current direct flow is not secure production fulfillment.

## Multiplayer Fairness Findings

| Requirement | Status | Finding |
| --- | --- | --- |
| 40-player room cap | **PARTIAL** | Node room checks `pilots.size >= 40`, but no verified load test is committed. |
| Synchronized start enforcement | **BROKEN** | Start timestamp is broadcast but not enforced client- or server-side. Late joiners may not receive the original start event. |
| Reconnect seat ownership | **BROKEN** | Unsigned device id; replacement/old-close race can evict the active reconnect. |
| Stale cleanup | **PARTIAL** | Client removes tracks after 6 s; server removes silent sockets after 30 s. No reconnect grace seat reservation. |
| Bounded input validation | **BROKEN** | HTTP body has a 4 KiB guard; WebSocket frames have no configured max payload/rate limit and state values are accepted unbounded. |
| Server-authoritative finish | **BROKEN** | Server trusts client finish notification, time, and distance. |
| Server-authoritative rewards | **BROKEN** | Tournaments and entitlements are client-local. |

## Operational Safety Findings

| Control | Status | Finding |
| --- | --- | --- |
| Environment validation | **ABSENT** | Frontend env values silently default empty; backend validates only `PORT` via coercion. |
| Health endpoint | **PARTIAL** | `/health` exists on Node reference server; no readiness distinction or dependency checks. |
| Metrics | **ABSENT** | No `/metrics` or metrics exporter. |
| Structured logs | **ABSENT** | Startup `console.log` only. |
| CORS/origin enforcement | **BROKEN** | HTTP CORS is `*`; WebSocket upgrade origin is not checked. |
| Rate limiting | **ABSENT** | No HTTP, join, state-frame, finish, or emote limits. |
| Graceful shutdown | **ABSENT** | No signal handling or room drain. |
| Durable persistence | **ABSENT** | Rooms and leaderboard are process memory; restart loses all global data. |
| Dependency reproducibility | **BROKEN** | No lockfile; backend dependency `ws` absent from manifest. |
| CI/Docker | **ABSENT** | No workflows or Dockerfiles. |

## Product Integrity Findings

- Local bots are labeled “solo field” / squadron pilots: **good and should be preserved**.
- Online leaderboard UI degrades to an explicitly local board: **good and should be preserved**.
- Portal build runtime attempts to suppress direct paywall behavior: **wired but portal-sandbox unverified**.
- PWA assets are inconsistent: manifest and service worker reference files not present in the repository.
- UI action handlers exist in a large central switch, but no automated action-coverage test exists.
- Reward visibility exists in HUD/toasts, but trusted ownership does not exist for online competitive rewards.

## Verification Executed In This Audit

### Repository inventory

Executed through repository tools:

- Recursive file inventory (`**/*`): found TypeScript client, one Node `.mjs` server, scripts, docs, and PWA assets.
- Cargo search (`**/Cargo.toml`): **0 files**.
- Docker search (`**/Dockerfile*`): **0 files**.
- CI workflow search (`.github/workflows/*`): **0 files**.
- Dependency lockfile in recursive inventory: **none**.

Scope: local repository only.

### Frontend install

**NOT EXECUTED / BLOCKED AS A REPRODUCIBILITY GATE.**

- There is no `package-lock.json`, `npm-shrinkwrap.json`, pnpm lockfile, or yarn lockfile.
- A clean deterministic install command cannot be selected from repository evidence.
- Existing `node_modules` availability is implied by the successful build but is not clean-install evidence.

### Typecheck

**NOT EXECUTED AS A STANDALONE GATE.**

- `package.json` defines no `typecheck` script.
- `npm run build` invokes `vite build`, which transpiles TypeScript but does not establish a full `tsc --noEmit` pass.

### Lint

**NOT EXECUTED / ABSENT.** No lint script or lint configuration exists.

### Test suite

**NOT EXECUTED / ABSENT.** No test script or test runner configuration exists. `scripts/physcheck.ts` is an ad hoc harness, not part of an automated suite.

### Production build

Command executed by the repository build tool:

```text
npm run build
```

Observed result:

```text
vite v7.3.2 building client environment for production...
✓ 68 modules transformed.
dist/index.html  1,028.53 kB │ gzip: 285.30 kB
✓ built in 2.58s
```

Status: **PASS — local build only.** This is not a browser smoke test, staging test, load test, portal sandbox test, or deployment test.

### Rust gates

`cargo fmt`, `cargo clippy`, `cargo test`, and `cargo build`: **NOT APPLICABLE / BLOCKED**, because no Cargo workspace or Rust source exists.

### Docker build

**NOT APPLICABLE / BLOCKED**, because no Dockerfile exists.

### Backend execution/load test

**NOT EXECUTED IN M1.** The server dependency `ws` is absent from `package.json`; starting it would require mutating the dependency tree and would not represent a clean repository install.

## Deployment Blockers

Priority order:

1. **Canonical Rust authoritative service is absent.**
2. **No deterministic dependency install**: lockfile absent; backend `ws` dependency absent.
3. **Race truth is client-controlled**: start, movement, finish, score, tournament score, and reward claims are not server-derived.
4. **Reconnect seat ownership is unsafe.**
5. **No origin enforcement or rate limiting.**
6. **No durable global persistence.**
7. **No CI, standalone typecheck, lint, or automated tests.**
8. **No container/deploy artifact for backend.**
9. **No metrics or structured operational logs.**
10. **PWA precache references missing icon assets.**
11. **Portal SDK behavior has not passed Poki/CrazyGames sandbox QA.**
12. **Stripe entitlements are not webhook-authoritative.**

## M1 Release Verdict

**NOT RELEASE CANDIDATE READY.**

The repository contains a substantial and locally buildable vertical-slice client. It does **not** contain the stated Rust authoritative backend, reproducible install evidence, trusted competitive flow, or operational deployment baseline. The Node service should remain an experimental protocol reference, local bots should remain the explicit fallback, and no online ranking, tournament reward, paid entitlement, or portal-compliance claim should be treated as production-verified yet.
