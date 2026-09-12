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

## 🟡 Written and tested in CI, not yet exercised in production
- `protocol/contract.json` — the single machine-checked source of truth for the
  wire protocol. Asserted by **both** implementations:
  `src/game/__tests__/protocol-contract.test.ts` and
  `rust/crates/sunbird-protocol/tests/contract.rs`. This exists because the
  "Rust is the source of truth, TS mirrors it" comment had already gone false:
  `ServerMessage::Snapshot` shipped in Rust with no TypeScript counterpart, so
  the browser would have thrown on the first authoritative snapshot. The
  mirror is now fixed *and* pinned.
- `rust/crates/sunbird-server/src/validate.rs` — server-authoritative movement
  envelope. Client `state` frames are now checked for finiteness, world bounds,
  distance regression and a **time-aware** speed cap derived from the client's
  own physics ceiling (234 u/s = 128 fever × 1.5 wingboost + 42 boost), then
  canonicalised to wire precision. Rejections are dropped and counted as
  `sunbird_legacy_state_rejected_total{reason=…}`; the seat is never dropped.
  Rust tests are CI-verified only — the authoring sandbox has no toolchain.
- `scripts/botsim.mjs` — 40 headless pilots on the real wire protocol, seeded
  and reproducible. Gated in `.github/workflows/botsim.yml`: the Node reference
  job reports cheat containment, the Rust job **gates** on it
  (`--require-anticheat`). Measured locally against the reference server:
  40/40 connected in 42 ms, roster 40/40, broadcast cadence p95 66.8 ms, 13
  unique finish places, 4/4 mid-race resumes, 62.72 KB/s per client.

## 🔴 Aspirational (do not claim in commit messages)
- Server-side matchmaking is still aspirational; rooms are in-memory.
- Anti-cheat is **partial, not finished**. Movement plausibility is enforced
  (above), but identity, rate limiting and score-submission trust are not.
  Measured for the record: botsim logged **16,150 relayed cheats** against the
  unvalidated Node reference server, which is exactly the class of hole the
  Rust validator closes and the CI gate now guards.

## Next (in order)
1. Get `botsim.yml` green on a few PRs, then retire `scripts/mp-smoke.mjs`
   (botsim supersedes it: 40 clients vs 2, and it is actually in CI)
2. Deploy `sunbird-server` to a WebSocket host; point the daily leaderboard at it
3. Wire the client to consume the `snapshot` message it can now parse — the
   parser is no longer the blocker for authoritative rooms
4. Real-player ghost replays on the daily seed (async PvP)
5. First-run dive tutorial (30 s, once)
6. Coin sinks: consumable modifiers, skin upcycling
7. Port `main`'s 25-trail catalogue behind the trail palette test

See `ARCHITECTURE_REVIEW.md` for the full comparison against the
"TMULTIWORLDS" Bevy/Replicon proposal, including what was rejected and why.
