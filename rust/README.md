# Sunbird Rust backend

Authoritative multiplayer service for Sunbird: protocol validation, seat
tokens, room registry, and a WebSocket transport for live rooms.

## Layout

| crate | what it is |
| --- | --- |
| `crates/sunbird-protocol` | Wire protocol v1 — closed message enums, size/length limits, parse helpers. |
| `crates/sunbird-server` | Axum service — health/readiness/metrics, seat-token issuer (`auth.rs`), authoritative room registry (`rooms.rs`), WebSocket transport (`ws.rs`), server-authoritative movement envelope (`validate.rs`), and the legacy simple-protocol room service (`legacy.rs`) the shipped browser client speaks today. |

## Protocol source of truth

**`protocol/contract.json`** — not either implementation. Both sides are
asserted against it:

- Rust — `crates/sunbird-protocol/tests/contract.rs`
- TypeScript — `src/game/__tests__/protocol-contract.test.ts`

This file exists because "Rust is the source of truth, `src/game/protocol/v1.ts`
mirrors it" used to be a comment rather than a check, and the two had drifted:
`ServerMessage::Snapshot` existed in Rust with no TypeScript counterpart, so the
browser would have thrown `unknown server message type snapshot` on the first
authoritative snapshot frame. Add a variant to one side and the other's suite
fails. The contract also pins the movement envelope in `movement`, derived from
client physics constants — see `movement.derivation` for the arithmetic.

## Movement authority

`validate.rs` decides whether a client's `state` frame is physically possible
before it is stored or rebroadcast. The envelope is derived from the client's
own ceiling (`MAX_SPEED_FEVER` 128 × wingboost 1.5 + `BOOST_EXTRA_SPEED` 42 =
234 u/s), the speed check is time-aware so a frame-dropping connection is not
false-rejected, and a rejected frame is **dropped and counted, never fatal to
the seat**. Counted as `sunbird_legacy_state_rejected_total{reason=…}` with
reasons `nonFinite`, `outOfBounds`, `distanceRegression`, `speedCap`.

`.github/workflows/botsim.yml` runs 40 headless pilots against this server with
`--require-anticheat`, so a regression that lets a teleport or an absurd
magnitude reach another pilot fails the build.

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
| `GET /ws` | WebSocket — legacy simple protocol (`state`/`emote`/`ready`/`finish`), the self-hostable room server the browser ships with |

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
- `start` is broadcast once at least two pilots are seated and every pilot has
  pressed ready (6 s countdown).
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
