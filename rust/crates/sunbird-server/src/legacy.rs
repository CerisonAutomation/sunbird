//! Legacy "simple wire protocol" transport — the full authoritative PvP room
//! service in Rust.
//!
//! The browser client (`src/game/Realtime.ts`) has always spoken a minimal
//! frame vocabulary: `state` / `emote` / `ready` / `finish` up, and
//! `welcome` / `peers` / `left` / `state` / `emote` / `finish` / `start` /
//! `error` down. This module is the self-hostable Rust implementation of that
//! exact protocol, and the self-hosted replacement for the old managed
//! workers backend and the `server/sunbird-server.mjs` Node prototype. It keeps
//! the browser client working unchanged:
//!
//! - room codes + public matchmaking (40 pilots per room),
//! - a single 15 Hz packed state broadcast per room,
//! - server-assigned finish places (clients never decide who won),
//! - emotes and readied flags,
//! - a startup-triggered `start` frame once two pilots are seated and every
//!   seated pilot has explicitly readied up,
//! - stale-seat reaping and empty-room teardown as safety nets.
//!
//! Unlike protocol v1 (`ws.rs` / `rooms.rs`), this path is intentionally
//! self-contained: it mirrors the proven Node semantics one-to-one so the
//! production client needs no migration step. A future phase can collapse the
//! two registries once the browser has moved onto v1.

use crate::validate::{record_rejection, MotionBaseline, MotionPolicy, MotionSample};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    http::HeaderMap,
    response::{IntoResponse, Response},
};
use futures_util::{sink::SinkExt, stream::SplitSink, stream::StreamExt};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};
use sunbird_protocol::MAX_JSON_PAYLOAD_BYTES;
use tokio::sync::mpsc;
use uuid::Uuid;

/// Room capacity, matching the client lobby (40 pilots).
const CAPACITY: usize = 40;
/// Broadcast tick rate for packed state frames.
const TICK_HZ: u64 = 15;
/// Empty rooms are torn down after this long.
const EMPTY_ROOM_TTL: Duration = Duration::from_secs(60);
/// Pilots that stop talking for this long are dropped (crashed/killed peer).
const STALE_AFTER: Duration = Duration::from_secs(60);
/// Per-socket outbound queue depth.
const OUT_QUEUE: usize = 256;
/// Maximum inbound state updates per pilot per second. The client sends at 15 Hz;
/// 30 Hz allows a doubled-rate client without giving spammers headroom to flood
/// the room with thousands of frames per second.
const MAX_STATE_HZ: u64 = 30;

const MAX_NAME: usize = 14;
const MAX_SKIN: usize = 24;
const MAX_SEED: usize = 32;
const MAX_CODE: usize = 5;

const CODE_ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/* ----------------------------- wire frames ----------------------------- */

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "type")]
enum In {
    #[serde(rename = "state")]
    State { x: f64, y: f64, r: f64, d: f64 },
    #[serde(rename = "emote")]
    Emote { emote: String },
    #[serde(rename = "ready")]
    Ready { ready: bool },
    #[serde(rename = "finish")]
    Finish { time: f64, d: f64 },
    #[serde(rename = "leave")]
    Leave,
}

#[derive(Clone, Debug, Serialize)]
struct PeerInfo {
    id: String,
    name: String,
    hue: f64,
    skin: String,
    ready: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type")]
enum Out {
    #[serde(rename = "welcome")]
    Welcome {
        id: String,
        room: String,
        seed: String,
        capacity: usize,
    },
    #[serde(rename = "peers")]
    Peers { peers: Vec<PeerInfo> },
    #[serde(rename = "left")]
    Left { id: String },
    #[serde(rename = "state")]
    State {
        t: f64,
        pilots: Vec<(String, f64, f64, f64, f64)>,
    },
    #[serde(rename = "emote")]
    Emote { id: String, emote: String },
    #[serde(rename = "finish")]
    Finish { id: String, time: f64, place: usize },
    #[serde(rename = "start")]
    Start { at: u64, seed: String },
    #[serde(rename = "error")]
    Error { message: String },
}

/// Outbound unit: a serialized frame, or a directive to close the socket.
enum Outbox {
    Frame(String),
    Close,
}

/* ------------------------------ room state ------------------------------ */

struct Pilot {
    id: String,
    name: String,
    skin: String,
    hue: f64,
    x: f64,
    y: f64,
    rot: f64,
    distance: f64,
    has_state: bool,
    finished: bool,
    ready: bool,
    last_seen: Instant,
    /// Last inbound state timestamp; enforces max 30 Hz per seat so a
    /// runaway client can't flood the room with thousands of frames/sec.
    last_state_recv: Instant,
    motion_baseline: Option<MotionBaseline>,
    tx: mpsc::Sender<Outbox>,
}

struct Room {
    code: String,
    seed: String,
    public: bool,
    started_at: u64,
    finish_order: Vec<String>,
    pilots: HashMap<String, Pilot>,
    empty_since: Instant,
}

impl Room {
    fn new(code: String, seed: String, public: bool) -> Self {
        Self {
            code,
            seed,
            public,
            started_at: 0,
            finish_order: Vec::new(),
            pilots: HashMap::new(),
            empty_since: Instant::now(),
        }
    }
}

struct Registry {
    rooms: HashMap<String, Room>,
}

/// The legacy room registry, held behind a single `parking_lot` lock. Every
/// method takes `&self`, locks, mutates, and returns owned data — no lock ever
/// crosses an await point.
pub struct LegacyRooms {
    inner: RwLock<Registry>,
    motion_policy: MotionPolicy,
}

impl LegacyRooms {
    pub fn new() -> Self {
        Self {
            inner: RwLock::new(Registry {
                rooms: HashMap::new(),
            }),
            motion_policy: MotionPolicy::default(),
        }
    }

    /// Seat a pilot (creating or joining a room). Sends `welcome` to the
    /// newcomer, `peers` to everyone, and — once two pilots are present —
    /// broadcasts the current roster. A race starts only after every seated
    /// pilot explicitly readies up. Returns the joined room code.
    fn join(&self, identity: &Identity, tx: mpsc::Sender<Outbox>) -> Result<String, ()> {
        let mut reg = self.inner.write();
        let code = find_room(&mut reg, &identity.code, &identity.seed);
        let room = reg.rooms.get_mut(&code).ok_or(())?;
        if room.pilots.len() >= CAPACITY {
            let _ = tx.try_send(Outbox::Frame(frame(&Out::Error {
                message: "That room is full (40 pilots).".into(),
            })));
            return Err(());
        }

        let pilot = Pilot {
            id: identity.id.clone(),
            name: identity.name.clone(),
            skin: identity.skin.clone(),
            hue: identity.hue,
            x: 0.0,
            y: 0.0,
            rot: 0.0,
            distance: 0.0,
            has_state: false,
            finished: false,
            ready: false,
            last_seen: Instant::now(),
            last_state_recv: Instant::now(),
            motion_baseline: None,
            tx,
        };
        room.pilots.insert(identity.id.clone(), pilot);
        room.empty_since = Instant::now();

        send_to(
            room,
            &identity.id,
            &Out::Welcome {
                id: identity.id.clone(),
                room: room.code.clone(),
                seed: room.seed.clone(),
                capacity: CAPACITY,
            },
        );
        broadcast_peers(room);

        Ok(room.code.clone())
    }

    /// Remove a seat. Empty rooms are kept for the TTL so a quick rejoin can
    /// find them, then torn down by [`tick`](Self::tick).
    fn leave(&self, code: &str, id: &str) {
        let mut reg = self.inner.write();
        let Some(room) = reg.rooms.get_mut(code) else {
            return;
        };
        if room.pilots.remove(id).is_none() {
            return;
        }
        broadcast(room, &Out::Left { id: id.to_string() });
        if room.pilots.is_empty() {
            room.started_at = 0;
            room.finish_order.clear();
            room.empty_since = Instant::now();
        } else {
            broadcast_peers(room);
        }
    }

    /// Dispatch an inbound legacy frame against a seated pilot.
    fn on_message(&self, code: &str, id: &str, msg: In) {
        // An explicit `leave` is not a drop: free the seat now so peers see the
        // room shrink, exactly like the TypeScript gateway. Handled before the
        // registry lock is taken because `leave` acquires it itself.
        if let In::Leave = &msg {
            self.leave(code, id);
            return;
        }
        let mut reg = self.inner.write();
        let Some(room) = reg.rooms.get_mut(code) else {
            return;
        };
        let pilot = room.pilots.get_mut(id);
        match msg {
            In::State { x, y, r, d } => {
                let Some(p) = pilot else { return };
                // Per-seat rate limit: clamp to MAX_STATE_HZ so a single bad
                // client can't starve 39 others of broadcast bandwidth. The
                // first state from a seat is always allowed (has_state is
                // false on join) so a freshly-seated pilot isn't penalized.
                let now = Instant::now();
                if p.has_state {
                    let min_interval = Duration::from_micros(1_000_000 / MAX_STATE_HZ);
                    if now.duration_since(p.last_state_recv) < min_interval {
                        return;
                    }
                }
                let sample = MotionSample::new(x, y, r, d);
                if let Err(reason) =
                    self.motion_policy
                        .admit(p.motion_baseline.as_ref(), &sample, now)
                {
                    record_rejection(reason);
                    return;
                }
                let sample = self.motion_policy.canonicalise(sample);
                p.last_state_recv = now;
                p.x = sample.x;
                p.y = sample.y;
                p.rot = sample.rot;
                p.distance = sample.distance;
                p.motion_baseline = Some(MotionBaseline { sample, at: now });
                p.has_state = true;
                p.last_seen = now;
            }
            In::Emote { emote } => {
                if room.pilots.contains_key(id) {
                    let clean = sanitize(&emote, 12);
                    broadcast_except(
                        room,
                        &Out::Emote {
                            id: id.to_string(),
                            emote: clean,
                        },
                        id,
                    );
                }
            }
            In::Ready { ready } => {
                if let Some(p) = room.pilots.get_mut(id) {
                    p.ready = ready;
                    p.last_seen = Instant::now();
                }
                broadcast_peers(room);
                maybe_start(room);
            }
            In::Finish { time, d } => finish(room, id, time, d),
            // Handled at the top of this function, before the registry lock.
            In::Leave => {}
        }
    }

    /// 15 Hz broadcast tick + stale-seat reaping + empty-room teardown.
    /// Driven once per interval by [`spawn_tick`].
    fn tick(&self) {
        let now = Instant::now();
        let mut reg = self.inner.write();
        let mut dead: Vec<String> = Vec::new();

        for room in reg.rooms.values_mut() {
            if room.pilots.is_empty() {
                if now.duration_since(room.empty_since) >= EMPTY_ROOM_TTL {
                    dead.push(room.code.clone());
                }
                continue;
            }

            // Reap silently-dead peers (no close frame reached us).
            let stale: Vec<String> = room
                .pilots
                .iter()
                .filter(|(_, p)| now.duration_since(p.last_seen) >= STALE_AFTER)
                .map(|(id, _)| id.clone())
                .collect();
            for sid in &stale {
                if let Some(p) = room.pilots.remove(sid) {
                    let _ = p.tx.try_send(Outbox::Close);
                    broadcast(room, &Out::Left { id: sid.clone() });
                }
            }
            if !stale.is_empty() && !room.pilots.is_empty() {
                broadcast_peers(room);
            }

            let pilots: Vec<(String, f64, f64, f64, f64)> = room
                .pilots
                .values()
                .filter(|p| p.has_state)
                .map(|p| (p.id.clone(), p.x, p.y, p.rot, p.distance))
                .collect();
            if !pilots.is_empty() {
                broadcast(
                    room,
                    &Out::State {
                        t: epoch_seconds_ms(),
                        pilots,
                    },
                );
            }
        }

        for code in dead {
            reg.rooms.remove(&code);
        }
    }
}

/// Match the party-lobby contract used by the client: two or more seated
/// pilots are eligible, but nobody is pulled into a race before the whole
/// current flock confirms readiness. The six-second countdown gives late
/// roster frames time to arrive on slower portal connections.
fn maybe_start(room: &mut Room) {
    if room.pilots.len() < 2 || room.started_at != 0 || !room.pilots.values().all(|p| p.ready) {
        return;
    }
    room.started_at = epoch_ms() + 6000;
    broadcast(
        room,
        &Out::Start {
            at: room.started_at,
            seed: room.seed.clone(),
        },
    );
}

/* ----------------------------- room helpers ----------------------------- */

fn find_room(reg: &mut Registry, code: &str, seed: &str) -> String {
    if !code.is_empty() {
        if !reg.rooms.contains_key(code) {
            let room = Room::new(code.to_string(), seed.to_string(), false);
            reg.rooms.insert(code.to_string(), room);
        }
        return code.to_string();
    }

    // Public matchmaking: join the fullest open room on the same seed.
    let mut best: Option<(usize, String)> = None;
    for (c, room) in reg.rooms.iter() {
        if room.public && room.pilots.len() < CAPACITY && room.seed == seed {
            let n = room.pilots.len();
            let better = match &best {
                Some((bn, _)) => n > *bn,
                None => true,
            };
            if better {
                best = Some((n, c.clone()));
            }
        }
    }
    if let Some((_, c)) = best {
        return c;
    }

    let code = fresh_code(reg);
    let room = Room::new(code.clone(), seed.to_string(), true);
    reg.rooms.insert(code.clone(), room);
    code
}

fn fresh_code(reg: &Registry) -> String {
    loop {
        let bytes = Uuid::new_v4().into_bytes();
        let code: String = (0..5)
            .map(|i| CODE_ALPHABET[bytes[i] as usize % CODE_ALPHABET.len()] as char)
            .collect();
        if !reg.rooms.contains_key(&code) {
            return code;
        }
    }
}

/// Authoritative finish: the server assigns places by arrival order.
fn finish(room: &mut Room, id: &str, time: f64, distance: f64) {
    let Some(pilot) = room.pilots.get_mut(id) else {
        return;
    };
    if pilot.finished {
        return;
    }
    pilot.finished = true;
    pilot.distance = pilot.distance.max(distance);
    pilot.last_seen = Instant::now();
    room.finish_order.push(id.to_string());
    let place = room.finish_order.len();
    broadcast(
        room,
        &Out::Finish {
            id: id.to_string(),
            time,
            place,
        },
    );
}

fn broadcast_peers(room: &Room) {
    let peers: Vec<PeerInfo> = room
        .pilots
        .values()
        .map(|p| PeerInfo {
            id: p.id.clone(),
            name: p.name.clone(),
            hue: p.hue,
            skin: p.skin.clone(),
            ready: p.ready,
        })
        .collect();
    broadcast(room, &Out::Peers { peers });
}

fn broadcast(room: &Room, msg: &Out) {
    let text = frame(msg);
    for pilot in room.pilots.values() {
        let _ = pilot.tx.try_send(Outbox::Frame(text.clone()));
    }
}

fn broadcast_except(room: &Room, msg: &Out, except_id: &str) {
    let text = frame(msg);
    for (id, pilot) in room.pilots.iter() {
        if id == except_id {
            continue;
        }
        let _ = pilot.tx.try_send(Outbox::Frame(text.clone()));
    }
}

fn send_to(room: &Room, id: &str, msg: &Out) {
    if let Some(pilot) = room.pilots.get(id) {
        let _ = pilot.tx.try_send(Outbox::Frame(frame(msg)));
    }
}

fn frame(msg: &Out) -> String {
    serde_json::to_string(msg).unwrap_or_default()
}

/* ----------------------------- ws transport ----------------------------- */

#[derive(Deserialize)]
pub struct LegacyQuery {
    #[serde(default)]
    device: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    skin: Option<String>,
    #[serde(default)]
    hue: Option<String>,
    #[serde(default)]
    room: Option<String>,
    #[serde(default)]
    seed: Option<String>,
}

struct Identity {
    id: String,
    name: String,
    skin: String,
    hue: f64,
    code: String,
    seed: String,
}

/// WebSocket upgrade state for the legacy socket: room registry + allowed origins.
#[derive(Clone)]
pub struct LegacySocketState {
    pub rooms: Arc<LegacyRooms>,
    pub allowed_origins: Vec<String>,
}

pub async fn legacy_ws_handler(
    ws: WebSocketUpgrade,
    Query(params): Query<LegacyQuery>,
    State(state): State<LegacySocketState>,
    headers: HeaderMap,
) -> Response {
    let allowed = state.allowed_origins.iter().any(|o| o == "*");
    if !allowed {
        let origin = headers
            .get("origin")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if !state.allowed_origins.iter().any(|o| o == origin) {
            return (axum::http::StatusCode::FORBIDDEN, "origin not allowed").into_response();
        }
    }
    let identity = identity_from(params);
    ws.max_message_size(MAX_JSON_PAYLOAD_BYTES)
        .max_frame_size(MAX_JSON_PAYLOAD_BYTES)
        .on_upgrade(move |socket| serve_legacy(socket, state.rooms.clone(), identity))
}

/// Periodic 15 Hz broadcaster + reaper. Run once from `main()` at startup.
pub fn spawn_tick(rooms: Arc<LegacyRooms>) {
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_millis(1000 / TICK_HZ));
        loop {
            tick.tick().await;
            rooms.tick();
        }
    });
}

async fn serve_legacy(socket: WebSocket, rooms: Arc<LegacyRooms>, identity: Identity) {
    let (sink, mut stream) = socket.split();
    let (tx, rx) = mpsc::channel::<Outbox>(OUT_QUEUE);
    let writer = tokio::spawn(writer_task(sink, rx));

    let code = match rooms.join(&identity, tx) {
        Ok(code) => code,
        Err(()) => {
            let _ = writer.await;
            return;
        }
    };

    while let Some(frame) = stream.next().await {
        let payload = match frame {
            Ok(Message::Text(text)) => text.into_bytes(),
            Ok(Message::Binary(bytes)) => bytes,
            Ok(Message::Close(_)) => break,
            Ok(_) => continue, // ping/pong handled by axum
            Err(_) => break,
        };
        if let Ok(msg) = serde_json::from_slice::<In>(&payload) {
            rooms.on_message(&code, &identity.id, msg);
        }
    }

    rooms.leave(&code, &identity.id);
    let _ = writer.await;
}

async fn writer_task(mut sink: SplitSink<WebSocket, Message>, mut rx: mpsc::Receiver<Outbox>) {
    while let Some(item) = rx.recv().await {
        match item {
            Outbox::Frame(text) => {
                if sink.send(Message::Text(text)).await.is_err() {
                    break;
                }
            }
            Outbox::Close => {
                let _ = sink.send(Message::Close(None)).await;
                break;
            }
        }
    }
    let _ = sink.close().await;
}

/* ------------------------------- parsing ------------------------------- */

fn identity_from(params: LegacyQuery) -> Identity {
    let id = sanitize_opt(params.device, 64).unwrap_or_else(anon_id);
    let name = sanitize_opt(params.name, MAX_NAME).unwrap_or_else(|| "Pilot".to_string());
    let skin = sanitize_opt(params.skin, MAX_SKIN).unwrap_or_else(|| "sunbird".to_string());
    let hue = params
        .hue
        .and_then(|h| h.parse::<f64>().ok())
        .filter(|v| v.is_finite())
        .unwrap_or(0.0);
    let code = sanitize_opt(params.room, MAX_CODE)
        .map(|c| c.to_ascii_uppercase())
        .unwrap_or_default();
    let seed = sanitize_opt(params.seed, MAX_SEED).unwrap_or_else(today_str);
    Identity {
        id,
        name,
        skin,
        hue,
        code,
        seed,
    }
}

fn sanitize_opt(raw: Option<String>, max: usize) -> Option<String> {
    let raw = raw?;
    let out = sanitize(&raw, max);
    if out.is_empty() {
        None
    } else {
        Some(out)
    }
}

fn sanitize(raw: &str, max: usize) -> String {
    raw.chars()
        .filter(|c| !c.is_control())
        .take(max)
        .collect::<String>()
        .trim()
        .to_string()
}

fn anon_id() -> String {
    let hex = Uuid::new_v4().simple().to_string();
    format!("anon-{}", &hex[..8])
}

fn today_str() -> String {
    time::OffsetDateTime::now_utc().date().to_string()
}

fn epoch_ms() -> u64 {
    (time::OffsetDateTime::now_utc().unix_timestamp_nanos() / 1_000_000) as u64
}

/// Monotonic-ish wall clock in f64 seconds with sub-second resolution.
/// The client interpolates remote pilots 120 ms behind the server's clock; if
/// the tick timestamp has only 1-second granularity, all 15 frames in that
/// second share the same t and the interpolation buffer can never bracket
/// `renderAt = serverClock - 0.12`, so rivals freeze and teleport instead of
/// sliding smoothly. Returning millisecond precision (as fractional seconds)
/// restores the 15 Hz lerp every remote client depends on.
fn epoch_seconds_ms() -> f64 {
    epoch_ms() as f64 / 1000.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn epoch_seconds_ms_has_subsecond_resolution() {
        let a = epoch_seconds_ms();
        std::thread::sleep(std::time::Duration::from_millis(5));
        let b = epoch_seconds_ms();
        assert!(
            b > a,
            "epoch_seconds_ms should advance with sub-second precision"
        );
    }

    #[test]
    fn explicit_leave_frees_the_seat_and_tells_the_room() {
        let rooms = LegacyRooms::new();
        let (tx_a, _rx_a) = mpsc::channel(16);
        let (tx_b, mut rx_b) = mpsc::channel(16);
        let a = Identity {
            id: "p1".into(),
            name: "A".into(),
            skin: "s".into(),
            hue: 0.0,
            code: "ROOM".into(),
            seed: "2026-09-11".into(),
        };
        let b = Identity {
            id: "p2".into(),
            name: "B".into(),
            skin: "s".into(),
            hue: 0.0,
            code: "ROOM".into(),
            seed: "2026-09-11".into(),
        };
        let code = rooms.join(&a, tx_a).unwrap();
        rooms.join(&b, tx_b).unwrap();

        rooms.on_message(&code, &a.id, In::Leave);

        // The remaining pilot is told about it without waiting for a socket close.
        let mut frames: Vec<String> = Vec::new();
        while let Some(Outbox::Frame(text)) = rx_b.try_recv().ok() {
            frames.push(text);
        }
        let mut told = false;
        for text in &frames {
            if text.contains("left") && text.contains("p1") {
                told = true;
            }
        }
        assert!(told, "peers are told about the leave, got {frames:?}");

        let reg = rooms.inner.read();
        let room = reg.rooms.get(&code).expect("room outlives its seats");
        assert!(!room.pilots.contains_key("p1"), "the leaver's seat is free");
        assert!(room.pilots.contains_key("p2"), "the other pilot keeps their seat");
    }

    #[test]
    fn state_with_nan_is_dropped() {
        let rooms = LegacyRooms::new();
        let (tx, _rx) = mpsc::channel(8);
        let identity = Identity {
            id: "p1".into(),
            name: "A".into(),
            skin: "s".into(),
            hue: 0.0,
            code: "ROOM".into(),
            seed: "2026-09-11".into(),
        };
        let code = rooms.join(&identity, tx).unwrap();

        // Valid state accepted
        rooms.on_message(
            &code,
            &identity.id,
            In::State {
                x: 1.0,
                y: 2.0,
                r: 0.5,
                d: 100.0,
            },
        );
        // NaN coordinates dropped silently
        rooms.on_message(
            &code,
            &identity.id,
            In::State {
                x: f64::NAN,
                y: 2.0,
                r: 0.5,
                d: 100.0,
            },
        );
        rooms.on_message(
            &code,
            &identity.id,
            In::State {
                x: 1.0,
                y: f64::INFINITY,
                r: 0.5,
                d: 100.0,
            },
        );

        let reg = rooms.inner.read();
        let room = reg.rooms.get(&code).unwrap();
        let p = room.pilots.get(&identity.id).unwrap();
        assert!(p.has_state, "pilot should still have valid state");
        assert_eq!(p.x, 1.0, "NaN should not corrupt position");
        assert_eq!(p.y, 2.0, "Infinity should not corrupt position");
    }

    #[test]
    fn state_rate_limited_per_seat() {
        let rooms = LegacyRooms::new();
        let (tx, _rx) = mpsc::channel(8);
        let identity = Identity {
            id: "p1".into(),
            name: "A".into(),
            skin: "s".into(),
            hue: 0.0,
            code: "ROOM".into(),
            seed: "2026-09-11".into(),
        };
        let code = rooms.join(&identity, tx).unwrap();

        // Back-to-back state messages should only be accepted once (rate limited)
        rooms.on_message(
            &code,
            &identity.id,
            In::State {
                x: 1.0,
                y: 2.0,
                r: 0.5,
                d: 100.0,
            },
        );
        let first_dist = {
            let reg = rooms.inner.read();
            let room = reg.rooms.get(&code).unwrap();
            room.pilots.get(&identity.id).unwrap().distance
        };
        // Second message within the same interval is dropped
        rooms.on_message(
            &code,
            &identity.id,
            In::State {
                x: 100.0,
                y: 200.0,
                r: 0.5,
                d: 9999.0,
            },
        );
        let second_dist = {
            let reg = rooms.inner.read();
            let room = reg.rooms.get(&code).unwrap();
            room.pilots.get(&identity.id).unwrap().distance
        };
        assert_eq!(first_dist, 100.0, "first state should be accepted");
        assert_eq!(
            second_dist, 100.0,
            "second state within rate window should be dropped"
        );
    }
}
