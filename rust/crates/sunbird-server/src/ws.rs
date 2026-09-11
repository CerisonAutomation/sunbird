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

use crate::rooms::{JoinOutcome, RoomEvent, RoomManager, SEAT_TIMEOUT};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
};
use futures_util::{sink::SinkExt, stream::StreamExt};
use std::{sync::Arc, time::Duration};
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

pub async fn ws_handler(ws: WebSocketUpgrade, State(rooms): State<Arc<RoomManager>>) -> Response {
    ws.on_upgrade(move |socket| serve_socket(socket, rooms))
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

async fn serve_socket(socket: WebSocket, rooms: Arc<RoomManager>) {
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

    while let Some(Ok(frame)) = stream.next().await {
        let payload = match frame {
            Message::Text(text) => text.into_bytes(),
            Message::Binary(bytes) => bytes,
            Message::Close(_) => break,
            _ => continue, // ping/pong handled by axum
        };
        match sunbird_protocol::parse_client_message(&payload, MAX_JSON_PAYLOAD_BYTES) {
            Ok(msg) => match handle(&rooms, &mut seat, msg) {
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

struct Handled {
    replies: Vec<ServerMessage>,
    events: Option<broadcast::Receiver<RoomEvent>>,
}

fn handle(
    rooms: &RoomManager,
    seat: &mut Option<(Uuid, Uuid)>,
    msg: ClientMessage,
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
            room_id, seat_id, ..
        } => {
            // Token verification happens at the HTTP issuer; here we only
            // reattach a live seat that this process still tracks.
            let JoinOutcome {
                grant,
                room,
                events,
            } = rooms.reconnect(room_id, seat_id)?;
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
