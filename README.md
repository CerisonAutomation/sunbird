# 🐦 Sunbird — Tiny Glide

> A one-button, side-scrolling arcade glider. Hold to dive, release to soar, chase the daylight across procedurally generated islands.

[![CI](https://github.com/CerisonAutomation/sunbird/actions/workflows/ci.yml/badge.svg)](https://github.com/CerisonAutomation/sunbird/actions/workflows/ci.yml)

## Tech Stack

- **Renderer** — Three.js r186 (WebGL)
- **UI / HUD** — React 19 + TypeScript 5.9
- **Bundler** — Vite 7 + Tailwind CSS v4
- **Physics** — Fixed-step 120 Hz client simulation
- **Payments** — Stripe Payment Links (no backend required)
- **Multiplayer** — WebSocket relay (optional; configurable via env)
- **Leaderboard** — On-device fallback + optional HTTP backend ([LEADERBOARD_API.md](./LEADERBOARD_API.md))
- **PWA** — Service worker + Web App Manifest

## Quick Start

```bash
npm ci
npm run dev
```

Open `http://localhost:5173`.

## Environment Variables

Copy `.env.example` → `.env.local` and fill in values. See `.env.example` for full documentation.

| Variable | Required | Description |
|---|---|---|
| `VITE_STRIPE_PUBLISHABLE_KEY` | No | Stripe publishable key for real checkout |
| `VITE_STRIPE_GOLD_LINK` | No | Payment Link URL for Sunbird Gold |
| `VITE_STRIPE_VIP_LINK` | No | Payment Link URL for Sunbird VIP |
| `VITE_PORTAL_TARGET` | No | `none` (default) \| `poki` \| `crazy` |
| `VITE_LEADERBOARD_URL` | No | HTTP base URL for online leaderboard |
| `VITE_MULTIPLAYER_URL` | No | WebSocket URL for realtime multiplayer |

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production bundle (direct/PWA mode) |
| `npm run typecheck` | TypeScript type-check without emit |
| `npm test` | Run Vitest unit tests |
| `npm run verify` | typecheck + test + build |
| `npm run physcheck` | Run physics determinism harness |

## Portal Builds

Set `VITE_PORTAL_TARGET=poki` or `=crazy` and run `npm run build`. The build swaps in the portal SDK adapter and disables standalone Stripe/ad surfaces.

See [PORTAL_PUBLISHING.md](./PORTAL_PUBLISHING.md) for portal submission checklist.

## PWA / itch.io

The default build (`VITE_PORTAL_TARGET=none`) outputs a single-file HTML via `vite-plugin-singlefile` — ideal for itch.io drag-and-drop upload. The same build is a fully installable PWA.

## Architecture

```
src/
  game/         # All game logic (Three.js, physics, systems)
  sdk/          # Portal adapter (Poki / CrazyGames / none)
  utils/        # Shared utilities
server/         # Node.js WebSocket reference server (dev only)
scripts/        # Build-time and dev tooling
public/         # Static assets (manifest, sw.js, icons)
```

## License

MIT — see [LICENSE](./LICENSE)
