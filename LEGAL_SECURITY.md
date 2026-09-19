# Sunbird — Legal & Security Register

Honest, evidence-based register. Every "PASS" below names the code that was
checked; every "GAP" is a real open item, not aspiration. Companion documents:
[POKI_COMPLIANCE_AUDIT.md](POKI_COMPLIANCE_AUDIT.md) (platform rules) and
[PRODUCTION_READINESS_PLAN.md](PRODUCTION_READINESS_PLAN.md) (ops hardening).

## 1. Legal

### 1.1 Copyright & licensing — PASS

| Item | Evidence |
|---|---|
| Project license | `LICENSE` — MIT, Copyright (c) 2026 CerisonAutomation |
| Third-party **assets**: zero | `find src -name "*.png" -o -name "*.jpg" -o -name "*.webp" -o -name "*.mp3" -o -name "*.ogg" -o -name "*.woff*" -o -name "*.ttf"` → no results. All art is procedural canvas/SVG code (`src/game/Sunbird.ts` canonical bird, `src/game/Biomes.ts` scenery) and all audio is WebAudio synthesis. Nothing sampled, no font files, no images, no music files — there is no asset provenance to clear. |
| Dependencies | 27 declared deps; installed tree license census: **MIT 15, BSD-2-Clause 1, Apache-2.0 2** — all permissive, no copyleft (GPL/AGPL/MPL) anywhere in the build. |
| Runtime external code | Poki/CrazyGames SDK strings in `src/sdk/platform.ts` are *detection strings only* (checking for an already-injected global); the clean build ships no third-party scripts (verified in `POKI_COMPLIANCE_AUDIT.md`). |

### 1.2 Personal data & privacy

**Game build (what a player actually runs)** — PASS

- Persistence is `localStorage` only (`src/game/Storage.ts`): score, settings,
  challenge seeds, biome flags. No network identity, no cross-site storage,
  no cookies, no analytics, no ad pixels.
- No external account system, no chat, no PII capture — matching the Poki
  external-resources policy (see compliance audit).

**Optional multiplayer/social server (`server/`)** — PASS with one documented GAP

Data stored per participant (`server/src/identity`, `server/src/store/db.ts`):
`playerId` (server-random), `deviceId` (client-generated pseudonymous 64-char
id), `displayName` (self-chosen, default "Sunbird Pilot", length-capped),
optional 2-letter `countryCode` (self-reported, coarse), scores, ghost
flights, friend/squad relations. No email, no real name, no precise location,
no device fingerprinting beyond the client-generated id.

- **GAP L-1 — no public privacy policy / ToS document yet.** The server is
  inert in the shipped game builds (no endpoint is configured; see
  PRODUCTION_READINESS_PLAN). Before the social backend is switched on in
  production a public policy page must be published; Poki additionally
  requires a hosted privacy policy for any exception to its no-external-data
  rule. **Owner: CerisonAutomation. Status: blocked on product decision.**
- **GAP L-2 — no self-service profile erasure API.** `DELETE` exists for
  ghosts (`server/src/http/api.ts` `/mp/v1/ghosts/:id`) but a player cannot
  delete their own profile via the API; erasure would be performed
  out-of-band via the store. Under GDPR the right to erasure should be
  self-service. Low urgency (guest pseudonymous profiles, no contact data)
  but the honest state is: **not implemented**.
- Retention: the store is file-based and bounded; there is no scheduled
  purging. Documented here so it is a conscious choice, not an accident.

### 1.3 All-ages (COPPA-class) posture — PASS for the game build

No data collection of any kind happens inside the game build, no ads, no
IAP, no external links except through the platform's `openExternalLink`
(never used by the game itself). The all-ages bar set in the Poki audit
applies to content, which passed there.

## 2. Security

### 2.1 Client-side XSS surface — PASS (defence in depth, verified)

All user-controllable strings (rival/remote player names, room codes, emotes,
leaderboard entries, challenge names) that reach the DOM do so through:

1. **`escapeHtml()`** (`src/game/HUD.ts:1320`) — escapes all five specials
   `& < > " '`; applied at every `innerHTML` interpolation of external data
   (roster bar, standings, versus bar, board rows, tags). Verified by grep:
   the only unescaped `.name` interpolations feed `hud.toast()`, which
   renders via `el.textContent` (`src/game/HUD.ts:1051`), never HTML.
2. **Server-side input cleaning** — `cleanText()` (`server/src/util/http.ts:81`)
   strips control characters and `< > & "`, caps length, trims; edge API
   `sanitize()` (`api/_lib/http.ts:32`) does the same. So even a future
   client regression would need to survive the server strip first.
3. **No dangerous APIs** — grep of `src`, `server/src`, `api` for
   `eval(`, `new Function`, `document.write`, `setTimeout('...')` string
   forms: no hits.

### 2.2 Network & transport

| Control | Evidence |
|---|---|
| Game build makes **no cross-origin requests** | Runtime `fetch` calls (`src/game/Leaderboard.ts`, `src/game/GhostNet.ts`) target a same-origin base (`VITE_LEADERBOARD_URL`, defaulting to a relative path); the clean portal builds ship with social disabled (`POKI_COMPLIANCE_AUDIT.md`). No `XMLHttpRequest`, no WebSockets, no iframes, no third-party beacons in the game build. |
| WS auth | Seat-token issuance + verification, one-socket-one-seat, ownership checks (PRODUCTION_READINESS_PLAN "verified already done" column). |
| Origin allowlists | WS + HTTP origin checks (same register). |
| Body caps & timeouts | 3s request timeout, size caps (same register). |
| Rate limiting | Board reads 120/60s per-IP (`api/board.ts`), edge writes 30/60s, WS bucket 80/40s, social per-IP limiter — all in the production register with file pointers. |
| Secrets | Grep of source for key/secret/token literals with realistic entropy: **no hits**. All credentials are env-injected at deploy time. |

### 2.3 Supply chain

- `pnpm audit` → **No known vulnerabilities found** (re-run: `pnpm audit`).
- No lockfile drift: CI installs from `pnpm-lock.yaml`.
- Rust server crate is CI-gated (`.github/workflows/rust.yml`); no binaries
  are committed.

### 2.4 Deployment notes (for whoever runs it)

- Serve over HTTPS only; the social server's token scheme assumes TLS.
- The board read limiter keys on `x-forwarded-for` — behind a proxy that
  overwrites it honestly.
- Store file lives outside the web root (it does: `server/` is never served
  statically), so the JSON state file is not directly downloadable.

## 3. Verification commands

```bash
pnpm audit                                   # dependency vulnerabilities
pnpm verify                                  # typecheck (client+server) + unit tests + build
grep -rn "innerHTML" src --include="*.ts"    # eyeball: every one escapes external data
```

## 4. Open-items register

| ID | Item | Severity | Owner | Status |
|---|---|---|---|---|
| L-1 | Public privacy policy + ToS page | Blocking for social launch | CerisonAutomation | OPEN |
| L-2 | Self-service profile erasure API | Medium | eng | OPEN |
| S-1 | Scheduled data retention purge | Low | eng | OPEN |
| S-2 | Security headers (CSP, X-Content-Type-Options, frame-ancestors) on the *host* that serves the built game | Medium (platforms like Poki set their own; a self-hosted deploy must) | ops | OPEN for self-hosted deploys |
