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

**Multiplayer:** the Rust `sunbird-server` owns the WebSocket room protocol
(`GET /ws`, 15 Hz state, server-refereed finishes). It is **live on a GCP
free-tier VM**:

- Host: `sunbird-mp` — e2-micro, `us-central1-a`, Ubuntu 24.04, 30 GB
  standard disk, 4 GB swap (e2-micro has 1 GB RAM), external IP
  `34.123.76.46`, running as a hardened systemd unit (`User=nobody`,
  `MemoryMax=700M`, restart-on-failure). Always-free eligible.
- Endpoint: `ws://34.123.76.46:8080/ws` — two-client join/welcome/peers/
  start smoke-tested against the live VM.
- Redeploy after server changes: `bash rust/deploy/gcloud/deploy.sh`
  (cross-compiles for linux/amd64 in Docker, ships, restarts the service).

**TLS note:** pages served over HTTPS (portals, Vercel) cannot open a plain
`ws://` connection (mixed content). Portals currently build with
`VITE_MULTIPLAYER_URL=` (solo field, honestly labelled) until a domain is
pointed at the VM. To enable `wss://`: add an `A` record for your domain →
`34.123.76.46`, then give Caddy (already installed on the VM) a one-line
Caddyfile — it mints the Let's Encrypt cert automatically:

```
mp.yourdomain.com {
    reverse_proxy /ws localhost:8080
}
```

and set `VITE_MULTIPLAYER_URL=wss://mp.yourdomain.com` in the build env.

For any other host, the manual equivalent is still:

```bash
cargo build --release -p sunbird-server
./target/release/sunbird-server   # serves GET /ws on :8080
```

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

## 5. Stripe webhook entitlements (server-authoritative purchases)

The backend ships a verified webhook route — `POST /stripe/webhook` — so paid
entitlements are owned by the server, not by a client-side "I paid" button
(closes REPO_TRUTH_AUDIT #12).

Setup (once, ~5 minutes):

```bash
# 1. Give the worker the webhook signing secret (whsec_…):
cd backend && npx wrangler secret put STRIPE_WEBHOOK_SECRET

# 2. In the Stripe dashboard, add a webhook endpoint pointed at
#    https://<your-worker>.workers.dev/stripe/webhook
#    listening for: checkout.session.completed
```

How it works end to end:

1. The game opens your Payment Link with `client_reference_id=<deviceId>`
   (already wired in `Payments.ts`).
2. Stripe calls the webhook; the worker verifies the `Stripe-Signature`
   header (HMAC-SHA256 over `t.rawBody`, 5-minute replay window — see
   `backend/src/entitlements.ts`, pinned by `entitlements.test.ts`).
3. `amount_total` maps to the SKU: 299→gold, 199→vip, 99→starter. The grant
   is stored per deviceId in the leaderboard DO.
4. The game syncs on Stripe return + on "Restore purchases" via
   `GET /entitlements?device=…` and grants with source `stripe_webhook`.

Unset secret ⇒ the endpoint answers 503 and the game falls back to the
labelled manual-confirm flow, exactly as before. If you change prices in
Stripe, update `AMOUNT_TO_SKU` in `backend/src/entitlements.ts`.
