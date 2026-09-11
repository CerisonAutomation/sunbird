# Sunbird Backend — Cloudflare Workers + Durable Objects

The production backend for Sunbird's **live global leaderboard** and
**Mass Race multiplayer rooms**, running entirely on the **Cloudflare free
plan** — no credit card, no cold starts, no servers to babysit.

## Why this stack (serverless free-tier research, Sept 2026)

| Platform | Free requests | WebSockets | Stateful rooms | Free DB | Verdict |
|---|---|---|---|---|---|
| **Cloudflare Workers + DO** | **100k/day** | ✅ hibernatable | ✅ Durable Objects | ✅ 5 GB SQLite | **chosen** |
| Deno Deploy | 1M/month | ✅ | ❌ no room authority | KV only | runner-up |
| Supabase Edge Fns | 500k/month | via Realtime | ❌ channel-only, no authority | 500 MB (pauses after 7d idle) | no |
| Vercel Functions | 100k/month | ❌ no native WS | ❌ | ❌ | no |
| AWS Lambda + API GW WS | 1M/month (12 mo only) | ✅ | ❌ needs DynamoDB glue | 25 GB DDB | too complex, trial expires |

Deciding factors:

- **Durable Objects are the only free serverless primitive that gives each
  race room a single-threaded authority** — authoritative finish placement
  with zero race conditions, exactly what `server/sunbird-server.mjs` did.
- **WebSocket Hibernation** means idle rooms bill *zero* duration. The
  ~13,000 GB-s/day free duration budget is only spent while races run.
- SQLite-in-DO gives 5 GB free storage; leaderboard rows are <200 bytes,
  one per device → millions of pilots fit in the free tier.
- Workers have ~0 ms cold starts at 300+ edge locations, so `/board` feels
  instant worldwide.

## Layout

```
backend/
  wrangler.jsonc        # Worker + DO bindings + SQLite migrations
  src/index.ts          # router: /health /board /score + WS upgrade & matchmaking
  src/room.ts           # RoomDO — hibernatable 40-pilot race rooms, 15 Hz alarm tick
  src/leaderboard.ts    # LeaderboardDO — SQLite leaderboard (one row per device)
```

## Endpoints

Identical contract to `LEADERBOARD_API.md` and the old local reference
server (`server/sunbird-server.mjs`):

- `GET /health` → `{ ok, scores }`
- `GET /board?scope=global|daily&metric=distance|altitude|perfects|coins&device=ID`
  → `{ entries: BoardEntry[≤50], rank, total }`
- `POST /score` → `{ ok: true }` — sanitized, clamped, one row per device,
  only replaced by a better distance
- `wss://…/?device&name&skin&hue&room&seed` — WebSocket race rooms:
  `welcome/peers/start/state/emote/finish/left/error` server→client;
  `state/emote/ready/finish` client→server. Empty `room` = public
  matchmaking (per-seed directory DO); a 5-char code = private room.

## Local development

```bash
cd backend
npm install
npm run dev            # wrangler dev on http://127.0.0.1:8787 (Miniflare, real DO semantics)
```

Point the game at it:

```bash
# repo root .env
VITE_LEADERBOARD_URL=http://127.0.0.1:8787
VITE_MULTIPLAYER_URL=ws://127.0.0.1:8787
```

## Deploy (free, ~1 minute)

```bash
cd backend
npm install
npx wrangler login     # opens browser; free Cloudflare account is enough
npx wrangler deploy
```

Wrangler prints your URL, e.g. `https://sunbird-backend.<account>.workers.dev`.
Then in the repo root `.env`:

```bash
VITE_LEADERBOARD_URL=https://sunbird-backend.<account>.workers.dev
VITE_MULTIPLAYER_URL=wss://sunbird-backend.<account>.workers.dev
```

Rebuild the game (`npm run build`). The UI automatically switches its
badges from "on-device" to live-global when these URLs are set — no other
code changes needed.

Useful afterwards:

```bash
npm run tail           # live production logs
npx wrangler deployments list
```

## Free-plan budget notes

- 100k requests/day: WS messages bill 20:1 (1 request per 20 messages), so
  a 15 Hz race of 40 pilots costs ~30 req/s equivalents — dozens of
  concurrent full rooms fit comfortably.
- Duration: the 15 Hz broadcast alarm runs **only while a room has live
  pilots with state**; empty rooms stop the alarm and hibernate to zero.
- If the game outgrows the free tier, the $5/mo Workers Paid plan raises
  every limit with zero code changes.
