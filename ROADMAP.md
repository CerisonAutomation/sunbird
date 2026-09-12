# Sunbird — Honest Roadmap

What actually works today, what is written but not deployed, and what is fiction
until proven otherwise. This file exists so the commit log can't overclaim.

## ✅ Real and shipped (playable right now)
- Dive-and-glide physics, 8 modes, fever, thermals/gusts/ash storms per biome
- 60+ skins with mechanical perks — **every perk string is implemented and
  test-enforced** (speed, daylight, fever, magnet, weatherproof, stealth)
- Per-mode mastery: 5 levels, coin ramp, level-5 signature skills wired into
  coin/lift/fever/daylight pipelines
- Prize skins gated on real achievements; season pass; campaign; daily/weekly
  challenges; weekly events with physics modifiers
- Local squads/duels/leaderboards (see next section for the caveat)
- Ranked seasons (monthly): peak tracking, coin payout, halfway soft-reset —
  now surfaced on the Rank screen with countdown + projected reward
- Stormfront Royale escalation: three storm phases at 1 km / 2.2 km (wind
  +25% each act, eye-wall pays coins ×2)
- Accessibility: reduce-motion, colorblind-assist, and large-text toggles in
  Settings, persisted and applied via `<html>` classes
- Telemetry: local `dataLayer` bus + anonymous aggregate counters beaconed to
  `/telemetry` on tab-hide (no PII, no retries, no-op without a backend)
- Server-refereed race placements carry a visible "✓ refereed" stamp on the
  results card — honesty is the trust brand

## 🟡 Written, tested, NOT deployed to a public host yet
- `rust/` — `sunbird-server` (rooms, 15 Hz state, server-refereed finishes).
  **WIRED END-TO-END in dev**: `.env.example` + the vite `/mp` proxy connect
  the client to the Rust `/ws` socket; two real sockets joining the same room
  and exchanging 15 Hz state is verified by test (`npm run test:mp`), and the
  crate is CI-verified (fmt · clippy · tests · release build). Production
  needs only a WebSocket-capable host + `VITE_MULTIPLAYER_URL=wss://…`.
- `server/social/` — PGlite social layer (friends, squads, feed)
- Without a configured URL the game still falls back to local squadron
  pilots with human-sounding names — the lobby badge says which one you got.

## 🔴 Aspirational (do not claim in commit messages)
- Anti-cheat and server-side matchmaking are still aspirational; rooms today
  are in-memory and trust the client's position stream.

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
