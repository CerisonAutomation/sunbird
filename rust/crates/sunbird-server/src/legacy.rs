    http::HeaderMap,
    response::{IntoResponse, Response},
// Every field limit comes from the protocol crate, which is generated from
// protocol/contract.json. These were redefined locally and had already drifted:
// MAX_SKIN 24 vs the contract's 32, MAX_SEED 32 vs 64 — so a client sending a
// perfectly valid 30-char skin or 40-char seed was silently truncated by this
// server alone. Importing them makes the drift impossible rather than fixed.
use sunbird_protocol::{
    MAX_JSON_PAYLOAD_BYTES, MAX_NAME_CHARS, MAX_ROOM_CODE_CHARS, MAX_SEED_CHARS, MAX_SKIN_CHARS,
};
use crate::validate::{record_rejection, MotionBaseline, MotionPolicy, MotionSample};


    /// Last *accepted* position sample, which is what the server-authoritative
    /// speed check measures the next one against. `None` until the first frame.
    baseline: Option<MotionBaseline>,
    policy: MotionPolicy,
}

impl Default for LegacyRooms {
    fn default() -> Self {
        Self::new()
    }
        Self::with_policy(MotionPolicy::default())
    }

    /// Test seam: the same registry against a tightened or loosened envelope.
    pub fn with_policy(policy: MotionPolicy) -> Self {
            policy,
            baseline: None,
                    let now = Instant::now();
                    let claimed = MotionSample::new(x, y, r, d);
                    // Clients send intents; the server decides what is true.
                    // An impossible sample is dropped and counted, never
                    // rebroadcast — and never fatal to the seat.
                    if let Err(reason) = self.policy.admit(p.baseline.as_ref(), &claimed, now) {
                        record_rejection(reason);
                        return;
                    }
                    let accepted = self.policy.canonicalise(claimed);
                    p.x = accepted.x;
                    p.y = accepted.y;
                    p.rot = accepted.rot;
                    p.distance = accepted.distance;
                    p.last_seen = now;
                    p.baseline = Some(MotionBaseline {
                        sample: accepted,
                        at: now,
                    });
            In::Finish { time, d } => {
                // The *place* is already server-assigned by arrival order. The
                // reported time and distance are still client claims, so they
                // are bounded here rather than trusted.
                let time = if time.is_finite() {
                    time.clamp(0.0, 86_400.0)
                } else {
                    0.0
                };
                let distance = if d.is_finite() {
                    d.clamp(0.0, self.policy.max_distance)
                } else {
                    0.0
                };
                finish(room, id, time, distance);
            }
/// WebSocket upgrade state for the legacy socket: room registry + allowed origins.
#[derive(Clone)]
pub struct LegacySocketState {
    pub rooms: Arc<LegacyRooms>,
    pub allowed_origins: Vec<String>,
}

    State(state): State<LegacySocketState>,
    headers: HeaderMap,
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
    ws.max_message_size(MAX_JSON_PAYLOAD_BYTES)
        .max_frame_size(MAX_JSON_PAYLOAD_BYTES)
        .on_upgrade(move |socket| serve_legacy(socket, state.rooms.clone(), identity))
    let name = sanitize_opt(params.name, MAX_NAME_CHARS).unwrap_or_else(|| "Pilot".to_string());
    let skin = sanitize_opt(params.skin, MAX_SKIN_CHARS).unwrap_or_else(|| "sunbird".to_string());
    let code = sanitize_opt(params.room, MAX_ROOM_CODE_CHARS)
    let seed = sanitize_opt(params.seed, MAX_SEED_CHARS).unwrap_or_else(today_str);

#[cfg(test)]
mod tests {
    use super::*;

    fn identity(id: &str, code: &str) -> Identity {
        Identity {
            id: id.to_string(),
            name: id.to_string(),
            skin: "sunbird".to_string(),
            hue: 0.5,
            code: code.to_string(),
            seed: "test-seed".to_string(),
        }
    }

    /// One row of a packed `state` frame: id, x, y, rot, distance. Aliased
    /// because the bare tuple trips `clippy::type_complexity`.
    type WirePilot = (String, f64, f64, f64, f64);

    /// Drain a socket's outbound queue and return the pilots in the newest
    /// `state` frame, i.e. exactly what that player's browser would render.
    fn latest_state(rx: &mut mpsc::Receiver<Outbox>) -> Option<Vec<WirePilot>> {
        let mut found = None;
        while let Ok(item) = rx.try_recv() {
            if let Outbox::Frame(text) = item {
                let value: serde_json::Value = match serde_json::from_str(&text) {
                    Ok(value) => value,
                    Err(_) => continue,
                };
                if value["type"] == "state" {
                    let pilots = value["pilots"].as_array().map(|rows| {
                        rows.iter()
                            .map(|row| {
                                (
                                    row[0].as_str().unwrap_or_default().to_string(),
                                    row[1].as_f64().unwrap_or_default(),
                                    row[2].as_f64().unwrap_or_default(),
                                    row[3].as_f64().unwrap_or_default(),
                                    row[4].as_f64().unwrap_or_default(),
                                )
                            })
                            .collect()
                    });
                    found = pilots;
                }
            }
        }
        found
    }

    fn seat(rooms: &LegacyRooms, id: &str, code: &str) -> mpsc::Receiver<Outbox> {
        let (tx, rx) = mpsc::channel::<Outbox>(OUT_QUEUE);
        rooms.join(&identity(id, code), tx).expect("seat a pilot");
        rx
    }

    #[test]
    fn an_honest_flight_is_rebroadcast_to_peers() {
        let rooms = LegacyRooms::new();
        let mut alice = seat(&rooms, "alice", "HONST");
        let mut bob = seat(&rooms, "bob", "HONST");

        rooms.on_message(
            "HONST",
            "alice",
            In::State {
                x: 100.0,
                y: 20.0,
                r: 0.1,
                d: 100.0,
            },
        );
        rooms.tick();

        let seen = latest_state(&mut bob).expect("bob receives a state frame");
        assert_eq!(seen.len(), 1);
        assert_eq!(seen[0].0, "alice");
        assert!((seen[0].1 - 100.0).abs() < f64::EPSILON);
        // The room broadcast is a full-roster frame, so Alice also receives it.
        // That is pre-existing behaviour; the server just no longer relays
        // positions it has not admitted.
        let alice_view = latest_state(&mut alice).expect("alice receives the room frame");
        assert!(
            alice_view.iter().any(|(id, ..)| id == "alice"),
            "the roster frame no longer carries the sender"
        );
    }

    #[test]
    fn a_teleport_never_reaches_another_pilot() {
        let rooms = LegacyRooms::new();
        let _alice = seat(&rooms, "alice", "CHEAT");
        let mut bob = seat(&rooms, "bob", "CHEAT");

        rooms.on_message(
            "CHEAT",
            "alice",
            In::State {
                x: 100.0,
                y: 20.0,
                r: 0.1,
                d: 100.0,
            },
        );
        rooms.tick();
        let _ = latest_state(&mut bob);

        // Modified client jumps to the far end of the track one frame later.
        rooms.on_message(
            "CHEAT",
            "alice",
            In::State {
                x: 400_000.0,
                y: 20.0,
                r: 0.1,
                d: 400_000.0,
            },
        );
        rooms.tick();

        let seen = latest_state(&mut bob).expect("bob still receives frames");
        let alice = seen
            .iter()
            .find(|(id, ..)| id == "alice")
            .expect("alice is present");
        assert!(
            alice.1 < 1_000.0,
            "a teleport reached another pilot: x = {}",
            alice.1
        );
        assert!(
            alice.4 < 1_000.0,
            "a distance teleport reached another pilot: d = {}",
            alice.4
        );
    }

    #[test]
    fn absurd_and_non_finite_values_are_held_at_the_door() {
        let rooms = LegacyRooms::new();
        let _alice = seat(&rooms, "alice", "ABSUR");
        let mut bob = seat(&rooms, "bob", "ABSUR");

        for bogus in [f64::NAN, f64::INFINITY, 1e300, -1e300] {
            rooms.on_message(
                "ABSUR",
                "alice",
                In::State {
                    x: bogus,
                    y: 20.0,
                    r: 0.0,
                    d: 10.0,
                },
            );
        }
        rooms.tick();

        // Nothing was ever admitted, so there is no alice row to render at all.
        let seen = latest_state(&mut bob).unwrap_or_default();
        assert!(
            !seen.iter().any(|(id, ..)| id == "alice"),
            "an absurd coordinate produced a visible pilot row: {seen:?}"
        );
    }

    #[test]
    fn positions_are_canonicalised_before_they_hit_the_wire() {
        let rooms = LegacyRooms::new();
        let _alice = seat(&rooms, "alice", "ROUND");
        let mut bob = seat(&rooms, "bob", "ROUND");

        rooms.on_message(
            "ROUND",
            "alice",
            In::State {
                x: 123.456_789,
                y: 45.678_912,
                r: 0.123_456_789,
                d: 9_876.543_21,
            },
        );
        rooms.tick();

        let seen = latest_state(&mut bob).expect("state frame");
        let alice = seen
            .iter()
            .find(|(id, ..)| id == "alice")
            .expect("alice present");
        assert_eq!(alice.1, 123.46, "x was not rounded to wire precision");
        assert_eq!(alice.2, 45.68, "y was not rounded to wire precision");
        assert_eq!(alice.3, 0.12, "rotation was not rounded to wire precision");
        assert_eq!(
            alice.4, 9_876.54,
            "distance was not rounded to wire precision"
        );
    }

    #[test]
    fn finish_place_is_assigned_by_arrival_not_by_the_claimed_time() {
        let rooms = LegacyRooms::new();
        let mut alice = seat(&rooms, "alice", "PLACE");
        let _bob = seat(&rooms, "bob", "PLACE");

        // Alice claims a world-record time but arrives second.
        rooms.on_message(
            "PLACE",
            "bob",
            In::Finish {
                time: 99.0,
                d: 1_000.0,
            },
        );
        rooms.on_message(
            "PLACE",
            "alice",
            In::Finish {
                time: 0.001,
                d: 1_000.0,
            },
        );
        rooms.tick();

        let alice_place = drain_for_place(&mut alice, "alice");
        assert_eq!(alice_place, Some(2), "a claimed time bought a better place");
    }

    #[test]
    fn a_bogus_claimed_finish_time_is_bounded() {
        let rooms = LegacyRooms::new();
        let mut alice = seat(&rooms, "alice", "FTIME");
        let _bob = seat(&rooms, "bob", "FTIME");

        rooms.on_message(
            "FTIME",
            "alice",
            In::Finish {
                time: f64::INFINITY,
                d: 1e300,
            },
        );
        rooms.tick();

        let mut time = None;
        while let Ok(Outbox::Frame(text)) = alice.try_recv() {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
                if value["type"] == "finish" && value["id"] == "alice" {
                    time = value["time"].as_f64();
                }
            }
        }
        let time = time.expect("a finish frame was broadcast");
        assert!(
            time.is_finite() && (0.0..=86_400.0).contains(&time),
            "unbounded time reached the wire: {time}"
        );
    }

    fn drain_for_place(rx: &mut mpsc::Receiver<Outbox>, id: &str) -> Option<usize> {
        let mut place = None;
        while let Ok(Outbox::Frame(text)) = rx.try_recv() {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
                if value["type"] == "finish" && value["id"] == id {
                    place = value["place"].as_u64().map(|v| v as usize);
                }
            }
        }
        place
    }
}
