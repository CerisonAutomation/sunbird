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

## Next (in order)
1. Deploy `backend/` to Cloudflare free tier; swap daily leaderboard to it
2. Real-player ghost replays on the daily seed (async PvP)
3. First-run dive tutorial (30 s, once)
4. Coin sinks: consumable modifiers, skin upcycling
5. Port `main`'s 25-trail catalogue behind the trail palette test
