# 🐦 Sunbird — Tiny Glide

> A one-button, side-scrolling arcade glider. Hold to dive, release to soar, chase the daylight across procedurally generated islands.

[![CI](https://github.com/CerisonAutomation/sunbird/actions/workflows/ci.yml/badge.svg)](https://github.com/CerisonAutomation/sunbird/actions/workflows/ci.yml)

## Tech Stack

- **Renderer** — Three.js r186 (WebGL)
- **UI / HUD** — React 19 + TypeScript 5.9
- **Bundler** — Vite 7 + Tailwind CSS v4
- **Physics** — Fixed-step client simulation with skill-based launch windows
- **Payments** — Stripe Payment Links (no backend required); portal builds strip all payment surfaces
- **Multiplayer** — Cloudflare Workers + Durable Objects room server ([backend/](./backend/)) with server-authoritative finish order
- **Leaderboard** — On-device fallback + optional Workers backend ([LEADERBOARD_API.md](./LEADERBOARD_API.md))
- **PWA** — Service worker (build-stamped cache) + Web App Manifest

## Quick Start

```bash
npm ci
npm run dev            # game on :5173
cd backend && npm ci && npx wrangler dev   # optional: multiplayer rooms on :8787
```

Open `http://localhost:5173`. The dev server proxies `/mp` to the room server.

## Environment Variables

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
| `npm test` | Run Vitest unit tests |
| `npm run verify` | typecheck + test + build |
| `npm run lint` | ESLint over src, scripts, backend |
| `npm run test:mp` | Two-client multiplayer smoke test (needs backend running) |
| `npm run physcheck` | Physics determinism harness |
| `npm run gen-icons` | Regenerate PWA icons |

## Deployment

- **Frontend** — Vercel: `vercel deploy --prod` (config in `vercel.json`). See [DEPLOY.md](./DEPLOY.md).
- **Backend** — Cloudflare Workers: `cd backend && npx wrangler deploy`. Free-tier friendly (WebSocket hibernation; rooms cost nothing while empty).
- **Portals** — `npm run build:portals` produces submission-ready zips for Poki, CrazyGames, and 10+ generic HTML5 portals. Compliance matrix in [PORTAL_PUBLISHING.md](./PORTAL_PUBLISHING.md).

## Game Systems

1 Player (daytrip / zenith / distance / coin rush / perfect / endless) · PvP (40-pilot mass race with live pilots + time-shifted leaderboard ghosts, ranked duels, Stormfront Royale) · PvE (daily challenge, weekly gauntlet, storm weather) · Tournaments (weekly cups) · Rival challenge links (`#rival=` URLs — zero-server async duels) · Mastery, missions, collections, season pass, nest economy.

## License

[MIT](./LICENSE)
