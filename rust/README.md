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
