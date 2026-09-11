//! Authoritative room registry — Phase 2/3.
//!
//! Rooms own the truth about seats, capacity, readiness and race starts.
//! The design goals, in order:
//!
//! 1. **No lock across await points.** Every public method takes `&self`,
//!    grabs the `parking_lot` lock, mutates, and returns owned data. The
//!    WebSocket layer never holds the registry lock while sending.
//! 2. **Broadcast fan-out per room.** Each room owns a
//!    `tokio::sync::broadcast` channel; sockets subscribe on join. Slow
//!    consumers drop frames (lagged) rather than back-pressuring the room.
//! 3. **Deterministic capacity control.** The host picks the field size
//!    (5..=40); joins beyond capacity are rejected with `RoomFull` exactly
//!    like the TypeScript client expects.
//! 4. **Seat generations for reconnects.** A reconnect bumps the seat
//!    generation; stale tokens from an older generation are refused.

use parking_lot::RwLock;
use std::collections::HashMap;
use std::time::{Duration, Instant};
use sunbird_protocol::{
    sanitize_text, PilotPublic, ProtocolError, RoomPublic, SeatGrant, MAX_NAME_CHARS, MAX_SEED_CHARS,
    MAX_SKIN_CHARS,
};
use tokio::sync::broadcast;
use uuid::Uuid;

/// Field-size limits mirror the client lobby (5..=40 rivals).
pub const MIN_CAPACITY: usize = 2;
pub const MAX_CAPACITY: usize = 40;
pub const DEFAULT_CAPACITY: usize = 40;
/// Seats that miss heartbeats for this long are swept.
pub const SEAT_TIMEOUT: Duration = Duration::from_secs(45);
/// Broadcast buffer per room; laggards drop frames, never block.
const ROOM_CHANNEL_CAPACITY: usize = 256;

/// A broadcast event fanned out to every socket seated in the room.
#[derive(Clone, Debug)]
pub enum RoomEvent {
    /// Roster changed (join/leave/ready/reconnect) — carries fresh public state.
    Roster(RoomPublic),
    /// The race started; clients switch to the countdown.
    Started { room_id: Uuid, seed: String, start_unix_ms: i64 },
}

struct Seat {
    seat_id: Uuid,
    player_id: Uuid,
    name: String,
    skin: String,
    ready: bool,
    generation: u64,
    joined_at: Instant,
    last_heartbeat: Instant,
}

struct Room {
    id: Uuid,
    code: String,
    seed: String,
    capacity: usize,
    host_seat_id: Uuid,
    started: bool,
    seats: Vec<Seat>,
    events: broadcast::Sender<RoomEvent>,
}

impl Room {
    fn to_public(&self) -> RoomPublic {
        RoomPublic {
            id: self.id,
            code: self.code.clone(),
            seed: self.seed.clone(),
            capacity: self.capacity as u32,
            host_seat_id: self.host_seat_id,
            pilots: self
                .seats
                .iter()
                .map(|s| PilotPublic {
                    joined_at: None,
                    id: s.seat_id,
                    name: s.name.clone(),
                    skin: s.skin.clone(),
                    ready: s.ready,
                    reconnecting: false,
                })
                .collect(),
        }
    }
}

/// Outcome of a successful join.
pub struct JoinOutcome {
    pub grant: SeatGrant,
    pub room: RoomPublic,
    pub events: broadcast::Receiver<RoomEvent>,
}

#[derive(Default)]
pub struct RoomManager {
    inner: RwLock<Registry>,
}

#[derive(Default)]
struct Registry {
    rooms: HashMap<Uuid, Room>,
    by_code: HashMap<String, Uuid>,
}

impl RoomManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Join by room code, creating the room when the code is unknown.
    /// An empty code means "matchmake": join the fullest open room on the
    /// same seed, or open a fresh one.
    pub fn join(
        &self,
        room_code: &str,
        seed: &str,
        name: &str,
        skin: &str,
        capacity_hint: Option<usize>,
    ) -> Result<JoinOutcome, ProtocolError> {
        let code = normalize_code(room_code);
        let seed = sanitize_text(seed, MAX_SEED_CHARS);
        let name = safe_name(name);
        let skin = sanitize_text(skin, MAX_SKIN_CHARS);
        if seed.is_empty() {
            return Err(ProtocolError::InvalidMessage { reason: "seed is required".into() });
        }

        let mut reg = self.inner.write();
        let room_id = if code.is_empty() {
            match reg
                .rooms
                .values()
                .filter(|r| !r.started && r.seed == seed && r.seats.len() < r.capacity)
                .max_by_key(|r| r.seats.len())
                .map(|r| r.id)
            {
                Some(id) => id,
                None => create_room(&mut reg, &seed, capacity_hint),
            }
        } else {
            match reg.by_code.get(&code).copied() {
                Some(id) => id,
                None => create_room_with_code(&mut reg, &seed, &code, capacity_hint),
            }
        };

        let room = reg.rooms.get_mut(&room_id).ok_or(ProtocolError::RoomNotFound)?;
        if room.started {
            return Err(ProtocolError::Rejected { message: "race already started".into() });
        }
        if room.seats.len() >= room.capacity {
            return Err(ProtocolError::RoomFull);
        }

        let now = Instant::now();
        let seat = Seat {
            seat_id: Uuid::new_v4(),
            player_id: Uuid::new_v4(),
            name,
            skin,
            ready: false,
            generation: 1,
            joined_at: now,
            last_heartbeat: now,
        };
        let grant = SeatGrant {
            room_id: room.id,
            seat_id: seat.seat_id,
            player_id: seat.player_id,
            generation: seat.generation,
            reconnect_token: String::new(), // filled by the auth issuer at the transport layer
        };
        if room.seats.is_empty() {
            room.host_seat_id = seat.seat_id;
        }
        room.seats.push(seat);
        let public = room.to_public();
        let events = room.events.subscribe();
        let _ = room.events.send(RoomEvent::Roster(public.clone()));
        Ok(JoinOutcome { grant, room: public, events })
    }

    /// Remove a seat. Empty rooms are torn down; a departing host hands the
    /// room to the longest-seated pilot.
    pub fn leave(&self, room_id: Uuid, seat_id: Uuid) -> Result<(), ProtocolError> {
        let mut reg = self.inner.write();
        let room = reg.rooms.get_mut(&room_id).ok_or(ProtocolError::RoomNotFound)?;
        let before = room.seats.len();
        room.seats.retain(|s| s.seat_id != seat_id);
        if room.seats.len() == before {
            return Err(ProtocolError::SeatNotFound);
        }
        if room.seats.is_empty() {
            let code = room.code.clone();
            reg.rooms.remove(&room_id);
            reg.by_code.remove(&code);
            return Ok(());
        }
        if room.host_seat_id == seat_id {
            if let Some(oldest) = room.seats.iter().min_by_key(|s| s.joined_at) {
                room.host_seat_id = oldest.seat_id;
            }
        }
        let public = room.to_public();
        let _ = room.events.send(RoomEvent::Roster(public));
        Ok(())
    }

    /// Flip a seat's ready flag. When every seat is ready (and at least two
    /// are present) the race starts and a `Started` event is broadcast.
    pub fn set_ready(&self, room_id: Uuid, seat_id: Uuid, ready: bool) -> Result<bool, ProtocolError> {
        let mut reg = self.inner.write();
        let room = reg.rooms.get_mut(&room_id).ok_or(ProtocolError::RoomNotFound)?;
        let seat = room
            .seats
            .iter_mut()
            .find(|s| s.seat_id == seat_id)
            .ok_or(ProtocolError::SeatNotFound)?;
        seat.ready = ready;
        seat.last_heartbeat = Instant::now();
        let all_ready = room.seats.len() >= MIN_CAPACITY && room.seats.iter().all(|s| s.ready);
        let started = !room.started && all_ready;
        if started {
            room.started = true;
            let _ = room.events.send(RoomEvent::Started {
                room_id: room.id,
                seed: room.seed.clone(),
                start_unix_ms: unix_ms_in(Duration::from_secs(3)),
            });
        }
        let public = room.to_public();
        let _ = room.events.send(RoomEvent::Roster(public));
        Ok(started)
    }

    /// Record a heartbeat; unknown seats error so zombie sockets get closed.
    pub fn heartbeat(&self, room_id: Uuid, seat_id: Uuid) -> Result<(), ProtocolError> {
        let mut reg = self.inner.write();
        let room = reg.rooms.get_mut(&room_id).ok_or(ProtocolError::RoomNotFound)?;
        let seat = room
            .seats
            .iter_mut()
            .find(|s| s.seat_id == seat_id)
            .ok_or(ProtocolError::SeatNotFound)?;
        seat.last_heartbeat = Instant::now();
        Ok(())
    }

    /// Reattach to an existing seat after a dropped socket. Bumps the seat
    /// generation (invalidating older tokens) and returns a fresh grant.
    pub fn reconnect(&self, room_id: Uuid, seat_id: Uuid) -> Result<JoinOutcome, ProtocolError> {
        let mut reg = self.inner.write();
        let room = reg.rooms.get_mut(&room_id).ok_or(ProtocolError::RoomNotFound)?;
        let seat = room
            .seats
            .iter_mut()
            .find(|s| s.seat_id == seat_id)
            .ok_or(ProtocolError::SeatNotFound)?;
        seat.generation += 1;
        seat.last_heartbeat = Instant::now();
        let grant = SeatGrant {
            room_id: room.id,
            seat_id: seat.seat_id,
            player_id: seat.player_id,
            generation: seat.generation,
            reconnect_token: String::new(),
        };
        let room_public = room.to_public();
        let events = room.events.subscribe();
        let _ = room.events.send(RoomEvent::Roster(room_public.clone()));
        Ok(JoinOutcome { grant, room: room_public, events })
    }

    /// Sweep seats whose heartbeats went silent, then drop empty rooms.
    /// Returns how many seats were reaped. Call this on a timer.
    pub fn sweep(&self, timeout: Duration) -> usize {
        let mut reg = self.inner.write();
        let now = Instant::now();
        let mut reaped = 0usize;
        let mut dead_rooms: Vec<(Uuid, String)> = Vec::new();
        for room in reg.rooms.values_mut() {
            let before = room.seats.len();
            room.seats.retain(|s| now.duration_since(s.last_heartbeat) < timeout);
            let lost = before - room.seats.len();
            reaped += lost;
            if room.seats.is_empty() {
                dead_rooms.push((room.id, room.code.clone()));
            } else if lost > 0 {
                if !room.seats.iter().any(|s| s.seat_id == room.host_seat_id) {
                    if let Some(oldest) = room.seats.iter().min_by_key(|s| s.joined_at) {
                        room.host_seat_id = oldest.seat_id;
                    }
                }
                let public = room.to_public();
                let _ = room.events.send(RoomEvent::Roster(public));
            }
        }
        for (id, code) in dead_rooms {
            reg.rooms.remove(&id);
            reg.by_code.remove(&code);
        }
        reaped
    }

    /// Public snapshot for the ops/debug endpoint.
    pub fn stats(&self) -> RoomStats {
        let reg = self.inner.read();
        RoomStats {
            rooms: reg.rooms.len(),
            seats: reg.rooms.values().map(|r| r.seats.len()).sum(),
            started: reg.rooms.values().filter(|r| r.started).count(),
        }
    }
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomStats {
    pub rooms: usize,
    pub seats: usize,
    pub started: usize,
}

fn create_room(reg: &mut Registry, seed: &str, capacity_hint: Option<usize>) -> Uuid {
    let code = fresh_code(reg);
    create_room_with_code(reg, seed, &code, capacity_hint)
}

fn create_room_with_code(reg: &mut Registry, seed: &str, code: &str, capacity_hint: Option<usize>) -> Uuid {
    let id = Uuid::new_v4();
    let capacity = capacity_hint.unwrap_or(DEFAULT_CAPACITY).clamp(MIN_CAPACITY, MAX_CAPACITY);
    let (events, _keepalive) = broadcast::channel(ROOM_CHANNEL_CAPACITY);
    reg.rooms.insert(
        id,
        Room {
            id,
            code: code.to_string(),
            seed: seed.to_string(),
            capacity,
            host_seat_id: Uuid::nil(),
            started: false,
            seats: Vec::new(),
            events,
        },
    );
    reg.by_code.insert(code.to_string(), id);
    id
}

/// Room codes: 5 chars, unambiguous alphabet (no 0/O/1/I), like the client.
fn fresh_code(reg: &Registry) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    loop {
        let id = Uuid::new_v4();
        let bytes = id.as_bytes();
        let code: String = (0..5).map(|i| ALPHABET[bytes[i] as usize % ALPHABET.len()] as char).collect();
        if !reg.by_code.contains_key(&code) {
            return code;
        }
    }
}

fn normalize_code(raw: &str) -> String {
    raw.trim().to_ascii_uppercase().chars().filter(|c| c.is_ascii_alphanumeric()).take(5).collect()
}

fn safe_name(raw: &str) -> String {
    let cleaned = sanitize_text(raw, MAX_NAME_CHARS);
    if cleaned.is_empty() {
        "Pilot".to_string()
    } else {
        cleaned
    }
}

fn unix_ms_in(delay: Duration) -> i64 {
    let now = time::OffsetDateTime::now_utc();
    (now.unix_timestamp_nanos() / 1_000_000) as i64 + delay.as_millis() as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    fn join(mgr: &RoomManager, code: &str, name: &str) -> JoinOutcome {
        mgr.join(code, "2026-09-11", name, "sunbird", None).expect("join")
    }

    #[test]
    fn join_creates_room_and_first_pilot_hosts() {
        let mgr = RoomManager::new();
        let a = join(&mgr, "ABCDE", "Kestrel");
        assert_eq!(a.room.code, "ABCDE");
        assert_eq!(a.room.host_seat_id, a.grant.seat_id);
        assert_eq!(a.room.pilots.len(), 1);
        let b = join(&mgr, "ABCDE", "Swift");
        assert_eq!(b.room.id, a.room.id);
        assert_eq!(b.room.pilots.len(), 2);
        assert_eq!(b.room.host_seat_id, a.grant.seat_id, "host stays with the first pilot");
    }

    #[test]
    fn capacity_is_enforced() {
        let mgr = RoomManager::new();
        for i in 0..MIN_CAPACITY {
            mgr.join("FULLR", "s", &format!("p{i}"), "sunbird", Some(MIN_CAPACITY)).expect("join within capacity");
        }
        let err = mgr.join("FULLR", "s", "late", "sunbird", Some(MIN_CAPACITY)).unwrap_err();
        assert!(matches!(err, ProtocolError::RoomFull));
    }

    #[test]
    fn matchmaking_prefers_fuller_open_room_on_same_seed() {
        let mgr = RoomManager::new();
        join(&mgr, "AAAAA", "a1");
        join(&mgr, "BBBBB", "b1");
        join(&mgr, "BBBBB", "b2");
        let matched = join(&mgr, "", "wanderer");
        assert_eq!(matched.room.code, "BBBBB", "joins the fullest open room");
    }

    #[test]
    fn everyone_ready_starts_the_race_once() {
        let mgr = RoomManager::new();
        let a = join(&mgr, "READY", "a");
        let b = join(&mgr, "READY", "b");
        assert!(!mgr.set_ready(a.room.id, a.grant.seat_id, true).expect("ready a"));
        assert!(mgr.set_ready(b.room.id, b.grant.seat_id, true).expect("ready b"), "last ready starts the race");
        // A started room refuses new joins.
        let err = mgr.join("READY", "s", "late", "sunbird", None).unwrap_err();
        assert!(matches!(err, ProtocolError::Rejected { .. }));
    }

    #[test]
    fn leaving_hands_over_the_host_and_empty_rooms_die() {
        let mgr = RoomManager::new();
        let a = join(&mgr, "HANDS", "host");
        let b = join(&mgr, "HANDS", "next");
        mgr.leave(a.room.id, a.grant.seat_id).expect("host leaves");
        let stats = mgr.stats();
        assert_eq!(stats.seats, 1);
        mgr.leave(b.room.id, b.grant.seat_id).expect("last leaves");
        assert_eq!(mgr.stats().rooms, 0, "empty room is torn down");
        // Same code can be reused afterwards.
        let again = join(&mgr, "HANDS", "fresh");
        assert_eq!(again.room.pilots.len(), 1);
    }

    #[test]
    fn reconnect_bumps_generation() {
        let mgr = RoomManager::new();
        let a = join(&mgr, "RECON", "flaky");
        let again = mgr.reconnect(a.room.id, a.grant.seat_id).expect("reconnect");
        assert_eq!(again.grant.generation, a.grant.generation + 1);
        assert_eq!(again.grant.player_id, a.grant.player_id);
    }

    #[test]
    fn sweep_reaps_silent_seats() {
        let mgr = RoomManager::new();
        join(&mgr, "SWEEP", "ghost");
        assert_eq!(mgr.sweep(Duration::from_secs(60)), 0, "fresh seats survive");
        assert_eq!(mgr.sweep(Duration::from_nanos(0)), 1, "silent seats are reaped");
        assert_eq!(mgr.stats().rooms, 0);
    }

    #[test]
    fn names_are_sanitized_and_defaulted() {
        let mgr = RoomManager::new();
        let out = mgr.join("NAMES", "s", "  \u{0007}  ", "sunbird", None).expect("join");
        assert_eq!(out.room.pilots[0].name, "Pilot");
        let long = mgr.join("NAMES", "s", "ABCDEFGHIJKLMNOPQR", "sunbird", None).expect("join");
        assert!(long.room.pilots[1].name.chars().count() <= MAX_NAME_CHARS);
    }
}
