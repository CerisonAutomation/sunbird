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
| Multiplayer | Self-hosted Rust room server ([rust/](./rust/)) — lobby, seats, synchronized starts, server-authoritative finish order and a movement envelope that rejects impossible client positions |
| Leaderboard | Vercel Functions ([api/](./api/)) + Vercel KV, on-device fallback ([LEADERBOARD_API.md](./LEADERBOARD_API.md)) |
| Ghosts | Async PvP via ghost publish/chase ([src/game/GhostNet.ts](./src/game/GhostNet.ts)) |
| PWA | Service worker (build-stamped cache) + manifest (web builds only) |

## Quick start
## Environment variables
| `npm test` | Run Vitest unit tests (212 tests, 31 files) |
| `npm run lint` | ESLint over src, scripts (`--max-warnings 0`) |
| `npm run test:mp` | Two-client multiplayer smoke test — needs `npm run dev` **and** the room server running |
| `npm run botsim` | Headless load test: N real WebSocket pilots on the wire protocol |
| `npm run botsim:40` | 40-pilot load + anti-cheat + resume run (the CI gate) |
## Testing

- **Unit** — `npm test`: pure-function coverage across PvP rating, challenges, mastery, economy, ghost codecs, protocol parsing, and bit-exact `Bird.step()` determinism on seeded terrain.
- **Stability** — the suite is loop-safe: 100 consecutive runs green with zero flakes (each run is independent; no shared state, no wall-clock dependence — season/week tests are timezone-independent).
- **Multiplayer smoke** — `npm run test:mp` joins two real WebSocket clients to the same room through the dev proxy and asserts roster visibility plus live state frames (`peers-visible=true`, 5+ frames in 4 s).
- **Load** — `npm run botsim:40`: 40 real WebSocket pilots on the shipped protocol. Gated in `.github/workflows/botsim.yml`; the Rust job requires cheat containment (`--require-anticheat`), so a regression that lets a teleport through fails the build.
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
scripts/        verify-prod, botsim, physcheck, portal packaging, icon gen
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

- **Portals** — `npm run build:portals` produces submission-ready zips for Poki, CrazyGames, and 10+ generic HTML5 portals.
## Game systems
1 Player (daytrip / zenith / distance / coin rush / perfect / endless) · PvP (40-pilot mass race with live pilots + time-shifted leaderboard ghosts, ranked duels, Stormfront Royale) · PvE (daily challenge, weekly gauntlet, storm weather) · Tournaments (weekly cups) · Rival challenge links (`#rival=` URLs — zero-server async duels) · Room invites (`#room=` URLs — private race rooms) · Share cards (flight image + referral + beat-me link in one tap) · Mastery, missions, collections, season pass, nest economy.
