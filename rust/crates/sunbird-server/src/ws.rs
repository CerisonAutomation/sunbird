//! WebSocket transport for authoritative rooms.
//!
//! Task layout per socket (no lock ever crosses an await):
//!
//! ```text
//!   read loop (this task) ──► RoomManager (sync, parking_lot)
//!        │ replies                        │ broadcast events
//!        ▼                                ▼
//!   mpsc out-queue ◄──────────── forwarder task (per joined room)
//!        │
//!        ▼
//!   writer task (owns the socket sink)
//! ```
//!
//! - Frames are parsed through `sunbird_protocol::parse_client_message`
//!   (size-capped, version-checked, length-limited before deserialize).
//! - Any protocol violation gets one `ServerMessage::Error` and the socket
//!   is closed — misbehaving clients don't get retries.
//! - Room broadcasts fan out through a bounded queue; a slow consumer drops
//!   frames (broadcast lag) instead of back-pressuring the room.

use crate::{
    auth::SeatTokenIssuer,
    metrics,
    rooms::{JoinOutcome, RoomEvent, RoomManager, SEAT_TIMEOUT},
};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::HeaderMap,
    response::{IntoResponse, Response},
};
use futures_util::{sink::SinkExt, stream::StreamExt};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
use sunbird_protocol::{
    ClientMessage, ProtocolError, ServerMessage, ValidationError, MAX_JSON_PAYLOAD_BYTES,
    PROTOCOL_VERSION,
};
use tokio::sync::{broadcast, mpsc};
use tokio::task::JoinHandle;
use tracing::{debug, info};
use uuid::Uuid;

/// Sweep interval for silent seats (heartbeat timeout ÷ 3).
const SWEEP_EVERY: Duration = Duration::from_secs(15);
/// Per-socket outbound queue; when full the socket is considered dead.
const OUT_QUEUE: usize = 64;
/// Per-socket inbound rate limit (token bucket). The 8 KiB frame cap stops
/// big payloads but not spam: a legitimate client sends ~15 Hz state frames,
/// so a 40/s refill with an 80-frame burst absorbs real clients and cuts
/// off sustained spammers.
const MSG_BUCKET_BURST: f64 = 80.0;
const MSG_BUCKET_REFILL_PER_SEC: f64 = 40.0;

/// WebSocket upgrade state shared between the v1 and legacy socket handlers.
/// Carries the room registry and the list of allowed origins for WS origin
/// enforcement (mirrors the HTTP CORS layer but applies to the WS upgrade too).
#[derive(Clone)]
pub struct SocketState {
    pub rooms: Arc<RoomManager>,
    /// Issues and verifies single-generation seat tokens.
    pub issuer: Arc<SeatTokenIssuer>,
    pub allowed_origins: Vec<String>,
}

/// Validate the request `Origin` header against the configured allowed list.
/// In development (all origins `"*"`) we allow everything; in staging/production
/// the list must be explicit and every entry is an exact match.
pub fn origin_allowed(headers: &HeaderMap, allowed_origins: &[String]) -> bool {
    if allowed_origins.iter().any(|o| o == "*") {
        return true;
    }
    let provided = headers
        .get("origin")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    allowed_origins.iter().any(|o| o == provided)
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<SocketState>,
    headers: HeaderMap,
) -> Response {
    if !origin_allowed(&headers, &state.allowed_origins) {
        return (axum::http::StatusCode::FORBIDDEN, "origin not allowed").into_response();
    }
    ws.max_message_size(MAX_JSON_PAYLOAD_BYTES)
        .max_frame_size(MAX_JSON_PAYLOAD_BYTES)
        .on_upgrade(move |socket| serve_socket(socket, state.rooms, state.issuer))
}

/// Periodic reaper: run once from main() at startup.
pub fn spawn_sweeper(rooms: Arc<RoomManager>) {
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(SWEEP_EVERY);
        loop {
            tick.tick().await;
            let reaped = rooms.sweep(SEAT_TIMEOUT);
            if reaped > 0 {
                info!(reaped, "swept silent seats");
            }
        }
    });
}

async fn serve_socket(socket: WebSocket, rooms: Arc<RoomManager>, issuer: Arc<SeatTokenIssuer>) {
    let (mut sink, mut stream) = socket.split();
    let (out_tx, mut out_rx) = mpsc::channel::<ServerMessage>(OUT_QUEUE);

    // Writer task: sole owner of the socket sink.
    let writer: JoinHandle<()> = tokio::spawn(async move {
        while let Some(msg) = out_rx.recv().await {
            let text = match serde_json::to_string(&msg) {
                Ok(text) => text,
                Err(_) => continue,
            };
            if sink.send(Message::Text(text)).await.is_err() {
                break;
            }
        }
        let _ = sink.close().await;
    });

    let mut seat: Option<(Uuid, Uuid)> = None; // (room_id, seat_id)
    let mut forwarder: Option<JoinHandle<()>> = None;

    // Per-socket inbound rate limit (token bucket, see MSG_BUCKET_*).
    let mut msg_bucket = MSG_BUCKET_BURST;
    let mut bucket_refilled_at = Instant::now();

    while let Some(Ok(frame)) = stream.next().await {
        let payload = match frame {
            Message::Text(text) => text.into_bytes(),
            Message::Binary(bytes) => bytes,
            Message::Close(_) => break,
            _ => continue, // ping/pong handled by axum
        };
        let now = Instant::now();
        msg_bucket = (msg_bucket
            + now.duration_since(bucket_refilled_at).as_secs_f64() * MSG_BUCKET_REFILL_PER_SEC)
            .min(MSG_BUCKET_BURST);
        bucket_refilled_at = now;
        if msg_bucket < 1.0 {
            // One strike, like every other protocol violation: tell the
            // client, then close. Sustained abuse never gets a retry.
            metrics::note_ws_rate_limited();
            let _ = out_tx
                .send(ServerMessage::Error {
                    version: PROTOCOL_VERSION,
                    error: ProtocolError::RateLimited {
                        retry_after_ms: 250,
                    },
                })
                .await;
            break;
        }
        msg_bucket -= 1.0;

        match sunbird_protocol::parse_client_message(&payload, MAX_JSON_PAYLOAD_BYTES) {
            Ok(msg) => match handle(&rooms, &mut seat, msg, &issuer) {
                Ok(Handled { replies, events }) => {
                    if let Some(events) = events {
                        // New room subscription: replace any previous forwarder.
                        if let Some(old) = forwarder.take() {
                            old.abort();
                        }
                        forwarder = Some(spawn_forwarder(events, out_tx.clone()));
                    }
                    let mut dead = false;
                    for reply in replies {
                        if out_tx.send(reply).await.is_err() {
                            dead = true;
                            break;
                        }
                    }
                    if dead {
                        break;
                    }
                }
                Err(err) => {
                    let fatal = matches!(
                        err,
                        ProtocolError::RoomNotFound | ProtocolError::SeatNotFound
                    );
                    let _ = out_tx
                        .send(ServerMessage::Error {
                            version: PROTOCOL_VERSION,
                            error: err,
                        })
                        .await;
                    if fatal {
                        break;
                    }
                }
            },
            Err(err) => {
                let _ = out_tx
                    .send(ServerMessage::Error {
                        version: PROTOCOL_VERSION,
                        error: to_protocol_error(err),
                    })
                    .await;
                break;
            }
        }
    }

    // Socket gone: free the seat so the room can backfill.
    if let Some(task) = forwarder.take() {
        task.abort();
    }
    drop(out_tx); // lets the writer drain and exit
    if let Some((room_id, seat_id)) = seat {
        let _ = rooms.leave(room_id, seat_id);
        debug!(%room_id, %seat_id, "seat released on disconnect");
    }
    let _ = writer.await;
}

/// Pipes room broadcast events into this socket's outbound queue.
fn spawn_forwarder(
    mut events: broadcast::Receiver<RoomEvent>,
    out: mpsc::Sender<ServerMessage>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        loop {
            match events.recv().await {
                Ok(event) => {
                    if out.send(to_server_message(event)).await.is_err() {
                        break;
                    }
                }
                // Lagged: skip missed frames; the next roster event catches up.
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    })
}

fn to_server_message(event: RoomEvent) -> ServerMessage {
    match event {
        RoomEvent::Roster(room) => ServerMessage::RosterUpdate {
            version: PROTOCOL_VERSION,
            room,
        },
        RoomEvent::Started {
            room_id,
            seed,
            start_unix_ms,
        } => ServerMessage::Started {
            version: PROTOCOL_VERSION,
            room_id,
            start_at: time::OffsetDateTime::from_unix_timestamp_nanos(
                (start_unix_ms as i128) * 1_000_000,
            )
            .unwrap_or_else(|_| time::OffsetDateTime::now_utc()),
            seed,
        },
    }
}

#[derive(Debug)]
struct Handled {
    replies: Vec<ServerMessage>,
    events: Option<broadcast::Receiver<RoomEvent>>,
}

fn handle(
    rooms: &RoomManager,
    seat: &mut Option<(Uuid, Uuid)>,
    msg: ClientMessage,
    issuer: &SeatTokenIssuer,
) -> Result<Handled, ProtocolError> {
    match msg {
        ClientMessage::Join {
            room_code,
            seed,
            name,
            skin,
            ..
        } => {
            if seat.is_some() {
                return Err(ProtocolError::Rejected {
                    message: "already seated".into(),
                });
            }
            let JoinOutcome {
                grant,
                room,
                events,
            } = rooms.join(&room_code, &seed, &name, &skin, None)?;
            let grant = fill_reconnect_token(&grant, issuer);
            *seat = Some((grant.room_id, grant.seat_id));
            Ok(Handled {
                replies: vec![ServerMessage::Welcome {
                    version: PROTOCOL_VERSION,
                    grant,
                    room,
                }],
                events: Some(events),
            })
        }
        ClientMessage::Leave {
            room_id, seat_id, ..
        } => {
            require_seat(seat, room_id, seat_id)?;
            rooms.leave(room_id, seat_id)?;
            *seat = None;
            Ok(Handled {
                replies: vec![],
                events: None,
            })
        }
        ClientMessage::Ready {
            room_id,
            seat_id,
            ready,
            ..
        } => {
            require_seat(seat, room_id, seat_id)?;
            rooms.set_ready(room_id, seat_id, ready)?;
            Ok(Handled {
                replies: vec![],
                events: None,
            })
        }
        ClientMessage::Heartbeat {
            room_id, seat_id, ..
        } => {
            require_seat(seat, room_id, seat_id)?;
            rooms.heartbeat(room_id, seat_id)?;
            Ok(Handled {
                replies: vec![],
                events: None,
            })
        }
        ClientMessage::Reconnect {
            room_id,
            seat_id,
            reconnect_token,
            ..
        } => {
            // One socket, one seat: a seated socket reattaching with another
            // seat's (still-valid) token would occupy two slots.
            if seat.is_some() {
                return Err(ProtocolError::Rejected {
                    message: "already seated".into(),
                });
            }
            // The seat id is public (roster broadcasts list every seat), so
            // the signed token is the ONLY reattach credential. It is
            // single-generation: verify the signature, the exact
            // room/seat, and the seat's CURRENT generation before
            // reattaching — a captured or stale token is rejected.
            let claims = issuer
                .verify(&reconnect_token)
                .map_err(|_| ProtocolError::InvalidReconnectToken)?;
            if claims.room_id != room_id
                || claims.seat_id != seat_id
                || rooms.seat_generation(room_id, seat_id) != Some(claims.generation)
            {
                return Err(ProtocolError::InvalidReconnectToken);
            }
            let JoinOutcome {
                grant,
                room,
                events,
            } = rooms.reconnect(room_id, seat_id)?;
            let grant = fill_reconnect_token(&grant, issuer);
            *seat = Some((grant.room_id, grant.seat_id));
            Ok(Handled {
                replies: vec![ServerMessage::Welcome {
                    version: PROTOCOL_VERSION,
                    grant,
                    room,
                }],
                events: Some(events),
            })
        }
    }
}

/// Seat grants carry a fresh single-generation token so the client can
/// reattach once without a round-trip to the HTTP issuer.
fn fill_reconnect_token(
    grant: &sunbird_protocol::SeatGrant,
    issuer: &SeatTokenIssuer,
) -> sunbird_protocol::SeatGrant {
    let mut grant = grant.clone();
    grant.reconnect_token = issuer
        .issue(
            grant.player_id,
            grant.room_id,
            grant.seat_id,
            grant.generation,
        )
        .unwrap_or_default();
    grant
}

fn require_seat(
    seat: &Option<(Uuid, Uuid)>,
    room_id: Uuid,
    seat_id: Uuid,
) -> Result<(), ProtocolError> {
    match seat {
        Some((r, s)) if *r == room_id && *s == seat_id => Ok(()),
        _ => Err(ProtocolError::SeatNotFound),
    }
}

fn to_protocol_error(err: ValidationError) -> ProtocolError {
    match err {
        ValidationError::PayloadTooLarge => ProtocolError::PayloadTooLarge {
            max_bytes: MAX_JSON_PAYLOAD_BYTES,
        },
        ValidationError::UnsupportedVersion(v) => ProtocolError::UnsupportedVersion {
            version: v,
            min_supported: sunbird_protocol::PROTOCOL_MIN_VERSION,
        },
        other => ProtocolError::InvalidMessage {
            reason: other.to_string(),
        },
    }
}

#[cfg(test)]
mod reconnect_tests {
    use super::*;

    fn issuer() -> Arc<SeatTokenIssuer> {
        Arc::new(SeatTokenIssuer::new(
            b"01234567890123456789012345678901",
            Duration::from_secs(30),
        ))
    }

    #[test]
    fn reconnect_is_enforced_by_the_seat_token() {
        let rooms = RoomManager::new();
        let issuer = issuer();
        let grant = rooms
            .join("HIJ1", "2026-09-16", "Victim", "sunbird", None)
            .unwrap()
            .grant;

        // 1. Bogus token: rejected.
        let mut seat: Option<(Uuid, Uuid)> = None;
        let err = handle(
            &rooms,
            &mut seat,
            ClientMessage::Reconnect {
                version: PROTOCOL_VERSION,
                room_id: grant.room_id,
                seat_id: grant.seat_id,
                reconnect_token: "sb1.bogus.payload.sig".into(),
            },
            &issuer,
        )
        .unwrap_err();
        assert!(matches!(err, ProtocolError::InvalidReconnectToken));
        assert!(seat.is_none());

        // 2. Valid token: reattach succeeds, generation bumps, fresh token.
        let token = issuer
            .issue(
                grant.player_id,
                grant.room_id,
                grant.seat_id,
                grant.generation,
            )
            .unwrap();
        let ok = handle(
            &rooms,
            &mut seat,
            ClientMessage::Reconnect {
                version: PROTOCOL_VERSION,
                room_id: grant.room_id,
                seat_id: grant.seat_id,
                reconnect_token: token,
            },
            &issuer,
        )
        .unwrap();
        let welcome = &ok.replies[0];
        match welcome {
            ServerMessage::Welcome { grant: second, .. } => {
                assert_eq!(second.generation, grant.generation + 1);
                assert!(!second.reconnect_token.is_empty());
            }
            other => panic!("expected welcome, got {other:?}"),
        }
        assert_eq!(seat, Some((grant.room_id, grant.seat_id)));

        // 3. The pre-bump token is now stale even though it was genuine.
        let mut other: Option<(Uuid, Uuid)> = None;
        let err = handle(
            &rooms,
            &mut other,
            ClientMessage::Reconnect {
                version: PROTOCOL_VERSION,
                room_id: grant.room_id,
                seat_id: grant.seat_id,
                reconnect_token: token,
            },
            &issuer,
        )
        .unwrap_err();
        assert!(matches!(err, ProtocolError::InvalidReconnectToken));
        assert!(other.is_none());
    }

    #[test]
    fn a_seated_socket_cannot_reconnect_a_second_seat() {
        let rooms = RoomManager::new();
        let issuer = issuer();
        let grant = rooms
            .join("HIJ2", "2026-09-16", "TwoSeats", "sunbird", None)
            .unwrap()
            .grant;
        let token = issuer
            .issue(
                grant.player_id,
                grant.room_id,
                grant.seat_id,
                grant.generation,
            )
            .unwrap();
        // Seat the socket with Join.
        let mut seat: Option<(Uuid, Uuid)> = None;
        handle(
            &rooms,
            &mut seat,
            ClientMessage::Join {
                version: PROTOCOL_VERSION,
                intent_id: Uuid::new_v4(),
                room_code: "HIJ2".into(),
                seed: "2026-09-16".into(),
                name: "TwoSeats".into(),
                skin: "sunbird".into(),
                reconnect_token: None,
            },
            &issuer,
        )
        .unwrap();
        assert!(seat.is_some());
        // Now attempt to also reattach with the (valid) seat token: must
        // fail — one socket may hold one seat.
        let err = handle(
            &rooms,
            &mut seat,
            ClientMessage::Reconnect {
                version: PROTOCOL_VERSION,
                room_id: grant.room_id,
                seat_id: grant.seat_id,
                reconnect_token: token,
            },
            &issuer,
        )
        .unwrap_err();
        assert!(matches!(err, ProtocolError::Rejected { .. }));
        assert_eq!(seat, Some((grant.room_id, grant.seat_id)));
    }
}
