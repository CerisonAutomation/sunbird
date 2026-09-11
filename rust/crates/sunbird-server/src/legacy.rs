//! Legacy "simple wire protocol" transport — the full authoritative PvP room
//! service in Rust.
//!
//! The browser client (`src/game/Realtime.ts`) has always spoken a minimal
//! frame vocabulary: `state` / `emote` / `ready` / `finish` up, and
//! `welcome` / `peers` / `left` / `state` / `emote` / `finish` / `start` /
//! `error` down. This module is the self-hostable Rust implementation of that
//! exact protocol, and the direct replacement for both the Cloudflare Workers
//! backend and the old `server/sunbird-server.mjs` Node prototype. It keeps the
//! browser client working unchanged:
//!
//! - room codes + public matchmaking (40 pilots per room),
//! - a single 15 Hz packed state broadcast per room,
//! - server-assigned finish places (clients never decide who won),
//! - emotes and readied flags,
//! - a startup-triggered `start` frame once two pilots are seated,
//! - stale-seat reaping and empty-room teardown as safety nets.
//!
//! Unlike protocol v1 (`ws.rs` / `rooms.rs`), this path is intentionally
//! self-contained: it mirrors the proven Node semantics one-to-one so the
//! production client needs no migration step. A future phase can collapse the
//! two registries once the browser has moved onto v1.

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::Response,
};
use futures_util::{sink::SinkExt, stream::StreamExt, stream::SplitSink};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};
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
}

impl LegacyRooms {
    pub fn new() -> Self {
        Self {
            inner: RwLock::new(Registry { rooms: HashMap::new() }),
        }
    }

    /// Seat a pilot (creating or joining a room). Sends `welcome` to the
    /// newcomer, `peers` to everyone, and — once two pilots are present —
    /// broadcasts `start`. Returns the joined room code.
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
            tx,
        };
        room.pilots.insert(identity.id.clone(), pilot);
        room.empty_since = Instant::now();

        send_to(room, &identity.id, &Out::Welcome {
            id: identity.id.clone(),
            room: room.code.clone(),
            seed: room.seed.clone(),
            capacity: CAPACITY,
        });
        broadcast_peers(room);

        if room.pilots.len() >= 2 && room.started_at == 0 {
            room.started_at = epoch_ms() + 3000;
            broadcast(room, &Out::Start {
                at: room.started_at,
                seed: room.seed.clone(),
            });
        }

        Ok(room.code.clone())
    }

    /// Remove a seat. Empty rooms are kept for the TTL so a quick rejoin can
    /// find them, then torn down by [`tick`](Self::tick).
    fn leave(&self, code: &str, id: &str) {
        let mut reg = self.inner.write();
        let Some(room) = reg.rooms.get_mut(code) else { return };
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
        let mut reg = self.inner.write();
        let Some(room) = reg.rooms.get_mut(code) else { return };
        match msg {
            In::State { x, y, r, d } => {
                if let Some(p) = room.pilots.get_mut(id) {
                    p.x = x;
                    p.y = y;
                    p.rot = r;
                    p.distance = d;
                    p.has_state = true;
                    p.last_seen = Instant::now();
                }
            }
            In::Emote { emote } => {
                if room.pilots.contains_key(id) {
                    let clean = sanitize(&emote, 12);
                    broadcast_except(room, &Out::Emote { id: id.to_string(), emote: clean }, id);
                }
            }
            In::Ready { ready } => {
                if let Some(p) = room.pilots.get_mut(id) {
                    p.ready = ready;
                    p.last_seen = Instant::now();
                }
                broadcast_peers(room);
            }
            In::Finish { time, d } => finish(room, id, time, d),
        }
    }

    /// 15 Hz broadcast tick + stale-seat reaping + empty-room teardown.
    /// Driven once per interval by [`spawn_tick`].
    fn tick(&self) {
        let now = Instant::now();
        let now_secs = epoch_seconds();
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
                broadcast(room, &Out::State { t: now_secs, pilots });
            }
        }

        for code in dead {
            reg.rooms.remove(&code);
        }
    }
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
    let Some(pilot) = room.pilots.get_mut(id) else { return };
    if pilot.finished {
        return;
    }
    pilot.finished = true;
    pilot.distance = pilot.distance.max(distance);
    pilot.last_seen = Instant::now();
    room.finish_order.push(id.to_string());
    let place = room.finish_order.len();
    broadcast(room, &Out::Finish {
        id: id.to_string(),
        time,
        place,
    });
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
struct LegacyQuery {
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

pub async fn legacy_ws_handler(
    ws: WebSocketUpgrade,
    Query(params): Query<LegacyQuery>,
    State(rooms): State<Arc<LegacyRooms>>,
) -> Response {
    let identity = identity_from(params);
    ws.on_upgrade(move |socket| serve_legacy(socket, rooms, identity))
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
    let id = sanitize_opt(params.device, 64).unwrap_or_else(|| anon_id());
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

fn epoch_seconds() -> f64 {
    time::OffsetDateTime::now_utc().unix_timestamp_nanos() as f64 / 1_000_000_000.0
}
