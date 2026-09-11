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

## 🟡 Written, tested, NOT deployed to production (single `wrangler deploy` away)
- `backend/` — Cloudflare Workers + Durable Objects rooms, leaderboards, WS.
  **WIRED END-TO-END in dev**: `.env.example` + the vite `/mp` proxy connect
  the client to `wrangler dev` rooms; two real sockets joining the same DO
  room and exchanging 15 Hz state is verified by test (`npm run test:mp`).
  Production needs only the deploy + `VITE_MULTIPLAYER_URL=wss://…`.
- `server/social/` — PGlite social layer (friends, squads, feed)
- Without a configured URL the game still falls back to local squadron
  pilots with human-sounding names — the lobby badge says which one you got.

## 🔴 Aspirational (do not claim in commit messages)
- `rust/` — protocol crate + server skeleton. Compiles in CI only. There is no
  running Rust backend, no anti-cheat, no matchmaking. Phase 2 at best.

## ✅ Formerly "Next" — all shipped in-repo
1. ~~Deploy `backend/`~~ — code + wiring complete and smoke-tested against
   `wrangler dev`; the deploy itself needs a Cloudflare account (external).
2. ~~Real-player ghost replays on the daily seed (async PvP)~~ — SHIPPED:
   `GhostNet.ts` publishes your best daily flight (`POST /ghost`, thinned to
   ≤1500 samples, best-per-pilot-per-seed) and fetches a chaseable rival
   ghost near your PB (`GET /ghost`, never your own). Amber silhouette,
   pass-them bonus, silent no-op without a backend.
3. ~~First-run dive tutorial~~ — shipped earlier as FirstFlight coach.
4. ~~Coin sinks~~ — shipped: armed boosts, Nest upgrades (×10 tiers),
   trail shop, skin catalogue, gauntlet retries.
5. ~~Trail catalogue~~ — 18 trails live in TRAILS with palette-parity test.

## External-only (needs accounts/keys, not code)
- Cloudflare deploy of `backend/` + `VITE_MULTIPLAYER_URL` / `VITE_LEADERBOARD_URL`
- Stripe live payment links + webhook entitlement route (design in DEPLOY.md)
- Portal submissions (zips build ready: poki / crazy / generic)
