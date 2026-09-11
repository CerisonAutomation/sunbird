# Deploying Sunbird

One codebase, four targets. All builds are single-file (`vite-singlefile`):
everything inlines into `index.html` except icons/manifest/sw.

## 1. Vercel (or Netlify/Pages — any static host)

```bash
npm i -g vercel
vercel deploy --prod
```

`vercel.json` is already configured: static build to `dist/`, SPA rewrite
(which excludes `/api` so the leaderboard functions aren't shadowed),
immutable icon caching, `no-cache` on `sw.js`, and security headers.

**Leaderboard on Vercel:** the `api/` directory ships two serverless functions
(`GET /api/board`, `POST /api/score`) implementing `LEADERBOARD_API.md`.
They persist to Vercel KV when `KV_REST_API_URL` + `KV_REST_API_TOKEN` are set,
and fall back to an in-memory board otherwise (preview only, resets on cold
start). To enable it:

1. Create a KV store in the Vercel dashboard and add its `KV_REST_API_URL` +
   `KV_REST_API_TOKEN` to the project environment.
2. Set `VITE_LEADERBOARD_URL=/api` (same origin) in the build env and redeploy.
3. Optionally set `VITE_LEADERBOARD_SALT` (build) and `LEADERBOARD_SALT`
   (functions) to require HMAC-signed score submissions.

**Multiplayer on Vercel:** the static frontend cannot host the WebSocket room
server, so run the Rust `sunbird-server` on any WebSocket-capable host (a
small VPS, Fly.io, Railway, etc.):

```bash
cargo build --release -p sunbird-server
./target/release/sunbird-server   # serves GET /ws on :8080
```

Then set the env var in the Vercel project settings:

```
VITE_MULTIPLAYER_URL=wss://mp.example.com
```

and redeploy. Without it the game runs in solo/practice mode with local
squadron pilots — fully playable, honestly labelled in the lobby UI.

## 2. Poki

```bash
npm run build:poki        # → sunbird-poki.zip
```

Upload the zip via Poki for Developers (Inspector). The build:
- loads the official Poki SDK v2 and fires `gameLoadingFinished`,
  `gameplayStart/Stop`, `commercialBreak`, `rewardedBreak`
- boots even if the SDK is blocked or slow (6 s cap, then NullAdapter)
- registers **no** service worker and ships **no** manifest link
- shows portal-safe monetization only (no external checkout)

## 3. CrazyGames

```bash
npm run build:crazy       # → sunbird-crazy.zip
```

Upload via the CrazyGames developer portal. Uses SDK v3 (`game.loadingStart/
Stop`, `gameplayStart/Stop`, `ad.requestAd`, optional `banner.requestBanner`
via `VITE_CRAZY_BANNER_ID`). Same graceful-degradation guarantees as Poki.

## 4. Self-hosted / itch.io style

```bash
npm run build             # → dist/ (index.html + icons + manifest + sw)
```

Serve `dist/` from any static server. PWA install + offline shell work
out of the box on HTTPS origins.

## Fonts

Fredoka / Atkinson Hyperlegible load from Google Fonts as a progressive
enhancement (`display=swap`, non-render-blocking). If the CDN is blocked
(some portals, offline), the UI falls back to Trebuchet MS / Segoe UI —
this is deliberate and tested; do not make the font link render-blocking.

## Env matrix

| Variable | Web | Poki | Crazy |
|---|---|---|---|
| `VITE_PORTAL_TARGET` | unset | `poki` | `crazy` |
| `VITE_MULTIPLAYER_URL` | `/mp` (dev) or `wss://…` | unset (portals: solo field) | unset |
| `VITE_CRAZY_BANNER_ID` | — | — | optional |
