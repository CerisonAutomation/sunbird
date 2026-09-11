# Sunbird social server (friends · clubs · chat)

A tiny REST service backed by **PGlite** (embedded Postgres, zero external
dependencies) living in `server/social/`. The client (`src/game/Squad.ts` +
the Squad screen) degrades to a clearly-labelled offline state when it is not
configured — no fake friends, ever.

## Run

```sh
cd server/social
npm install
node social-server.mjs           # listens on 0.0.0.0:8788
# PORT=9000 PGLITE_DIR=/var/lib/sunbird-social node social-server.mjs
```

Point the game at it:

```sh
# .env
VITE_SOCIAL_URL=https://your-social-host.example
```

## Model

- Players self-register with their `deviceId`; the public **friend code** is
  derived exactly like the referral code in `SaveData.ts` (`SUN-` + last 6
  alphanumerics, uppercased), so codes match what players already share.
- Friends are mutual follows keyed by friend code.
- Clubs cap at 30 members; a player belongs to at most one club.
- Chat is club-scoped, 200 chars per message, paged 50 at a time via
  `?after=<id>`; angle brackets are stripped server-side.

## Routes

| method + path | body / query | returns |
| --- | --- | --- |
| `POST /register` | `{deviceId, name}` | `{code}` |
| `GET /profile` | `?device=` | `{name, code, friends[], clubId}` |
| `POST /friends/add` | `{deviceId, code}` | `{friend}` |
| `POST /friends/remove` | `{deviceId, code}` | `{ok}` |
| `GET /clubs` | `?device=` | `{clubs[], mine}` |
| `POST /clubs/create` | `{deviceId, name, motto, playerName}` | `{club}` |
| `POST /clubs/join` | `{deviceId, clubId, playerName}` | `{ok}` |
| `POST /clubs/leave` | `{deviceId}` | `{ok}` |
| `GET /chat` | `?club=&after=` | `{messages[]}` |
| `POST /chat` | `{deviceId, text}` | `{message}` |
| `GET /health` | — | `{ok, players, clubs, messages}` |

All routes are CORS-open (`*`) and JSON-only; errors are
`{error: string}` with a 4xx status.
