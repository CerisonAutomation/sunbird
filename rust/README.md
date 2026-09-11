# Sunbird Rust backend

Authoritative multiplayer service for Sunbird: protocol validation, seat
tokens, room registry, and a WebSocket transport for live rooms.

## Layout

| crate | what it is |
| --- | --- |
| `crates/sunbird-protocol` | Wire protocol v1 — closed message enums, size/length limits, parse helpers. Source of truth mirrored by `src/game/protocol/v1.ts`. |
| `crates/sunbird-server` | Axum service — health/readiness/metrics, seat-token issuer (`auth.rs`), authoritative room registry (`rooms.rs`), WebSocket transport (`ws.rs`), and the legacy simple-protocol room service (`legacy.rs`) the shipped browser client speaks today. |

## Endpoints

| route | purpose |
| --- | --- |
| `GET /health`, `/ready` | liveness / readiness (also `/healthz`, `/readyz`) |
| `GET /metrics` | Prometheus text metrics |
| `GET /v1/hello` | protocol hello + limits |
| `POST /v1/reconnect-token` | HMAC seat-token issue |
| `GET /v1/degrade` | capability gate for the browser |
| `GET /v1/rooms` | ops snapshot: rooms/seats/started counts |
| `GET /v1/ws` | WebSocket — protocol v1 join/leave/ready/heartbeat/reconnect |
| `GET /ws` | WebSocket — legacy simple protocol (`state`/`emote`/`ready`/`finish`), the self-hostable replacement for the Cloudflare Workers backend and `server/sunbird-server.mjs` |

## Room semantics

- Room codes are 5 chars from an unambiguous alphabet (matches the client).
- Empty room code = matchmaking: join the fullest open room on the same seed.
- Capacity 2..=40, host is the first pilot; a departing host hands the room
  to the longest-seated pilot; empty rooms are torn down.
- All pilots ready (≥2 seated) → `started` broadcast with a start timestamp.
- Heartbeat timeout 45 s; a sweeper reaps silent seats every 15 s.
- Reconnect bumps the seat generation, invalidating older tokens.

### Legacy transport (`/ws`)

- Same room codes / matchmaking / 40-pilot capacity as the client expects.
- A single 15 Hz packed `state` broadcast per room; server-assigned `finish`
  places (clients never decide who won).
- `start` is broadcast once two pilots are seated (3 s countdown).
- Stale seats are reaped after 60 s of silence; empty rooms are torn down
  after a 60 s TTL.

Concurrency rule: **no lock crosses an await**. `RoomManager` is fully
synchronous behind `parking_lot::RwLock`; each socket has a writer task and
a broadcast-forwarder task connected by a bounded mpsc queue.

## Build & run

```sh
cd rust
cargo test --workspace
cargo run -p sunbird-server
# env: SUNBIRD_ENV, SUNBIRD_BIND_ADDR, SUNBIRD_PUBLIC_ORIGINS,
#      SUNBIRD_RECONNECT_HMAC_SECRET (32+ bytes),
#      SUNBIRD_RECONNECT_GRACE_SECONDS, SUNBIRD_SHUTDOWN_GRACE_SECONDS,
#      SUNBIRD_METRICS_BIND_ADDR (optional)
```

> The development sandbox used to author this code has no Rust toolchain and
> no network route to rustup/crates CDNs, so compilation runs in CI instead:
> `.github/workflows/rust.yml` runs fmt, clippy `-D warnings`, tests, and a
> release build (uploading the `sunbird-server` binary as an artifact) on
> every push touching `rust/`.
