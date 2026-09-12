# 🐦 Sunbird — Tiny Glide

> A one-button, side-scrolling arcade glider. Hold to dive, release to soar, chase the daylight across procedurally generated islands.

[![CI](https://github.com/CerisonAutomation/sunbird/actions/workflows/ci.yml/badge.svg)](https://github.com/CerisonAutomation/sunbird/actions/workflows/ci.yml)

## What it is

Sunbird is a complete HTML5 arcade game: 8 flight modes, 40-pilot races, daily/weekly PvE, tournaments, 60+ skins with real mechanical perks, a season pass, ghost replays, and portal-ready builds — all running fully offline with zero required backend.

- **1P** — daytrip / zenith / distance / coin rush / perfect / endless, plus campaign, mastery, missions, collections
- **PvP** — 40-pilot mass race (live pilots + time-shifted leaderboard ghosts), ranked duels, Stormfront Royale, `#rival=` zero-server challenge links
- **PvE** — seeded daily challenge, weekly gauntlet, storm weather, login calendar
- **Honesty rule** — anything simulated on-device is badged as local/practice in the UI; server-owned results only where a backend actually referees (see [ROADMAP.md](./ROADMAP.md))

## Tech stack

| Layer | Choice |
|---|---|
| Renderer | Three.js r186 (WebGL, ACES tone mapping) |
| UI / HUD | React 19 + TypeScript 5.9 (strict) |
| Bundler / style | Vite 7 + Tailwind CSS v4 |
| Physics | Fixed-step deterministic client sim (`Bird.step()`, bit-exact tested) |
| Audio | Zero-asset procedural WebAudio synth (SFX + adaptive score, portal-safe) |
| Payments | Stripe Payment Links (no backend); portal builds strip all payment surfaces |
| Multiplayer | Self-hosted Rust room server ([rust/](./rust/)) — lobby, seats, synchronized starts |
| Leaderboard | Vercel Functions ([api/](./api/)) + Vercel KV, on-device fallback ([LEADERBOARD_API.md](./LEADERBOARD_API.md)) |
| Ghosts | Async PvP via ghost publish/chase ([src/game/GhostNet.ts](./src/game/GhostNet.ts)) |
| PWA | Service worker (build-stamped cache) + manifest (web builds only) |

## Quick start

```bash
npm ci
npm run dev            # game on :5173
cargo run --release -p sunbird-server   # optional: multiplayer rooms on :8080
```

Open `http://localhost:5173`. The dev server proxies `/mp` to the Rust room server.

## Environment variables

Copy `.env.example` → `.env.local`. All variables are optional — the game runs fully offline without any.

| Variable | Description |
|---|---|
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key for real checkout |
| `VITE_STRIPE_GOLD_LINK` | Payment Link URL for Sunbird Gold ($2.99 lifetime) |
| `VITE_STRIPE_VIP_LINK` | Payment Link URL for Sunbird VIP ($1.99/mo) |
| `VITE_STRIPE_STARTER_LINK` | Payment Link URL for First Flight Pack ($0.99 one-time) |
| `VITE_PORTAL_TARGET` | `none` (default) \| `poki` \| `crazy` \| `generic` |
| `VITE_LEADERBOARD_URL` | HTTP base URL for the online leaderboard |
| `VITE_MULTIPLAYER_URL` | WebSocket URL for realtime multiplayer rooms |

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production bundle (chunked; Vercel/PWA) |
| `npm run build:vercel` | Same as `build` (explicit CDN target) |
| `npm run build:itch` | Single-file bundle → `dist-itch/` |
| `npm run build:poki` / `build:crazy` / `build:generic` | Portal zips (see [PORTAL_PUBLISHING.md](./PORTAL_PUBLISHING.md)) |
| `npm run build:portals` | All three portal zips |
| `npm run typecheck` | TypeScript type-check without emit |
| `npm test` | Run Vitest unit tests (212 tests, 31 files) |
| `npm run verify` | typecheck + test + build |
| `npm run lint` | ESLint over src, scripts (`--max-warnings 0`) |
| `npm run test:mp` | Two-client multiplayer smoke test — needs `npm run dev` **and** the room server running |
| `npm run physcheck` | Physics determinism harness |
| `npm run gen-icons` | Regenerate PWA icons |

## Testing

- **Unit** — `npm test`: pure-function coverage across PvP rating, challenges, mastery, economy, ghost codecs, protocol parsing, and bit-exact `Bird.step()` determinism on seeded terrain.
- **Stability** — the suite is loop-safe: 100 consecutive runs green with zero flakes (each run is independent; no shared state, no wall-clock dependence — season/week tests are timezone-independent).
- **Multiplayer smoke** — `npm run test:mp` joins two real WebSocket clients to the same room through the dev proxy and asserts roster visibility plus live state frames (`peers-visible=true`, 5+ frames in 4 s).
- **Rust** — `cargo fmt --check`, `cargo clippy`, `cargo test` in [rust/](./rust/).

## Builds & portals

| Target | Upload to | Ads | Payments |
|---|---|---|---|
| `dist/` (default) | Vercel / self-host | None (own interstitial) | Stripe enabled |
| `sunbird-poki.zip` | Poki Inspector | Poki commercial + rewarded | Stripped |
| `sunbird-crazy.zip` | CrazyGames portal | CrazyGames midgame + rewarded (+ banner slot) | Stripped |
| `sunbird-generic.zip` | GameDistribution, Yandex, itch.io, Newgrounds, GameMonetize, Lagged, Coolmath, Kongregate, Armor, GamePix, Famobi, SoftGames | None (host injects) | Stripped |
| `dist-itch/` | Direct-host / itch.io raw HTML | None | As configured |

Every portal zip is self-contained (`index.html` + `icons/` + `fonts/`), uses only relative paths, boots from any CDN subpath, mutes on tab-hide/ads, fires `gameplayStart/Stop` + loading signals, and degrades to local ghosts/boards with no backend. Full compliance matrix and QA checklist: [PORTAL_PUBLISHING.md](./PORTAL_PUBLISHING.md).

## Project structure

```
src/            React shell (App, main) + game/ (engine, HUD, systems)
rust/           Cargo workspace: sunbird-protocol + sunbird-server (Axum WS)
api/            Vercel leaderboard functions (+ _lib)
backend/        Optional Cloudflare Workers: ghosts, telemetry, Stripe entitlements
server/social/  Optional PGlite social layer (friends, squads, feed)
scripts/        verify-prod, mp-smoke, physcheck, portal packaging, icon gen
public/         PWA manifest, service worker, icons, self-hosted fonts
```

## Docs index

- [ROADMAP.md](./ROADMAP.md) — what works, what's wired-but-undeployed, what's aspirational (the anti-overclaim file)
- [PORTAL_PUBLISHING.md](./PORTAL_PUBLISHING.md) — portal compliance matrix + QA checklist
- [LEADERBOARD_API.md](./LEADERBOARD_API.md) — leaderboard + ghost API
- [SOCIAL_API.md](./SOCIAL_API.md) — social layer API
- [DEPLOY.md](./DEPLOY.md) — hosting, env, Stripe webhook setup
- [RUST_MIGRATION_PLAN.md](./RUST_MIGRATION_PLAN.md) — phased backend plan + rollback
- [GAME_AUDIT_2026-09.md](./GAME_AUDIT_2026-09.md) — competitive audit + implementation log

## Deployment

- **Frontend** — Vercel: `vercel deploy --prod` (config in `vercel.json`). See [DEPLOY.md](./DEPLOY.md).
- **Leaderboard** — Vercel Functions in `api/`, persisted in Vercel KV (optional; in-memory fallback for previews).
- **Multiplayer** — Self-hosted Rust: `cargo build --release -p sunbird-server`. In-memory rooms cost nothing while empty. See [rust/README.md](./rust/README.md).
- **Portals** — `npm run build:portals` produces submission-ready zips for Poki, CrazyGames, and 10+ generic HTML5 portals.

## Game systems

1 Player (daytrip / zenith / distance / coin rush / perfect / endless) · PvP (40-pilot mass race with live pilots + time-shifted leaderboard ghosts, ranked duels, Stormfront Royale) · PvE (daily challenge, weekly gauntlet, storm weather) · Tournaments (weekly cups) · Rival challenge links (`#rival=` URLs — zero-server async duels) · Room invites (`#room=` URLs — private race rooms) · Share cards (flight image + referral + beat-me link in one tap) · Mastery, missions, collections, season pass, nest economy.

## License

[MIT](./LICENSE)
