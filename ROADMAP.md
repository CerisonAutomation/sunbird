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

## 🟡 Written, tested, NOT deployed (single `wrangler deploy` away)
- `backend/` — Cloudflare Workers + Durable Objects rooms, leaderboards, WS
- `server/social/` — PGlite social layer (friends, squads, feed)
- Until one of these is deployed, all "multiplayer" is client-side simulation
  with human-sounding bot names. We say so here so nobody else has to.

## 🔴 Aspirational (do not claim in commit messages)
- `rust/` — protocol crate + server skeleton. Compiles in CI only. There is no
  running Rust backend, no anti-cheat, no matchmaking. Phase 2 at best.

## Next (in order)
1. Deploy `backend/` to Cloudflare free tier; swap daily leaderboard to it
2. Real-player ghost replays on the daily seed (async PvP)
3. First-run dive tutorial (30 s, once)
4. Coin sinks: consumable modifiers, skin upcycling
5. Port `main`'s 25-trail catalogue behind the trail palette test
