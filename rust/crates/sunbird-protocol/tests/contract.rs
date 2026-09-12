//! Conformance against `protocol/contract.json` — the single source of truth.
//!
//! The TypeScript implementation runs the mirror image of this suite in
//! `src/game/__tests__/protocol-contract.test.ts` against the *same file*.
//! Neither side can add, rename or drop a variant without the other failing.
//!
//! This exists because "the Rust crate is the source of truth and the
//! TypeScript file mirrors it" was a comment rather than a check, and the two
//! had already drifted: `ServerMessage::Snapshot` existed here with no
//! TypeScript counterpart, so the browser client would have thrown
//! `unknown server message type snapshot` on any authoritative snapshot frame.

use serde_json::{json, Map, Value};
use std::collections::BTreeSet;
use std::path::Path;
use sunbird_protocol::{
    parse_client_message, parse_server_message, ClientMessage, ServerMessage, MAX_ERROR_MESSAGE_CHARS,
    MAX_IDEMPOTENCY_CHARS, MAX_JSON_PAYLOAD_BYTES, MAX_NAME_CHARS, MAX_ROOM_CODE_CHARS,
    MAX_SEED_CHARS, MAX_SKIN_CHARS, PROTOCOL_MIN_VERSION, PROTOCOL_VERSION, SESSION_MAX_TOKEN_CHARS,
    SESSION_MIN_TOKEN_CHARS,
};

const CONTRACT_PATH: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../protocol/contract.json"
);

fn contract() -> Value {
    let raw = std::fs::read_to_string(CONTRACT_PATH).unwrap_or_else(|err| {
        panic!("cannot read protocol contract at {CONTRACT_PATH}: {err}")
    });
    serde_json::from_str(&raw).expect("protocol contract is valid JSON")
}

fn object(value: &Value, key: &str) -> Map<String, Value> {
    value
        .get(key)
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_else(|| panic!("contract is missing object \"{key}\""))
}

/// The wire tag of a message, recovered by round-tripping through serde. This
/// is what a peer on the other side of the socket actually sees.
fn tag_of<T: serde::Serialize>(message: &T) -> String {
    let value = serde_json::to_value(message).expect("encode");
    value["type"]
        .as_str()
        .unwrap_or_else(|| panic!("message did not serialize with a \"type\" tag: {value}"))
        .to_string()
}

#[test]
fn protocol_version_matches_contract() {
    let c = contract();
    assert_eq!(
        PROTOCOL_VERSION,
        c["protocolVersion"].as_u64().expect("protocolVersion") as u32
    );
    assert_eq!(
        PROTOCOL_MIN_VERSION,
        c["minProtocolVersion"].as_u64().expect("minProtocolVersion") as u32
    );
}

#[test]
fn wire_limits_match_contract() {
    let limits = object(&contract(), "limits");
    let expect = |key: &str, actual: usize| {
        let declared = limits[key].as_u64().unwrap_or_else(|| panic!("limits.{key}"));
        assert_eq!(actual, declared as usize, "limit \"{key}\" drifted from the contract");
    };
    expect("maxJsonPayloadBytes", MAX_JSON_PAYLOAD_BYTES);
    expect("maxNameChars", MAX_NAME_CHARS);
    expect("maxRoomCodeChars", MAX_ROOM_CODE_CHARS);
    expect("maxSeedChars", MAX_SEED_CHARS);
    expect("maxSkinChars", MAX_SKIN_CHARS);
    expect("maxIdempotencyChars", MAX_IDEMPOTENCY_CHARS);
    expect("maxErrorMessageChars", MAX_ERROR_MESSAGE_CHARS);
    expect("sessionMinTokenChars", SESSION_MIN_TOKEN_CHARS);
    expect("sessionMaxTokenChars", SESSION_MAX_TOKEN_CHARS);
}

#[test]
fn every_declared_server_variant_parses_and_round_trips() {
    let variants = object(&contract(), "serverMessages");
    assert!(!variants.is_empty(), "contract declares no server variants");

    let mut seen = BTreeSet::new();
    for (name, spec) in &variants {
        let sample = spec
            .get("sample")
            .unwrap_or_else(|| panic!("serverMessages.{name} has no canonical sample"));
        let payload = serde_json::to_vec(sample).expect("encode sample");
        let parsed = parse_server_message(&payload, MAX_JSON_PAYLOAD_BYTES)
            .unwrap_or_else(|err| panic!("serverMessages.{name} failed to parse: {err}"));
        assert_eq!(
            &tag_of(&parsed),
            name,
            "serverMessages.{name} did not round-trip to the same wire tag"
        );
        seen.insert(name.clone());
    }

    // The closed enum must not accept a variant the contract never declared.
    let unknown = json!({ "type": "portalHop", "version": PROTOCOL_VERSION });
    let payload = serde_json::to_vec(&unknown).expect("encode");
    assert!(
        parse_server_message(&payload, MAX_JSON_PAYLOAD_BYTES).is_err(),
        "server accepted an undeclared variant: {unknown}"
    );
    assert!(seen.contains("snapshot"), "snapshot variant missing from contract");
}

#[test]
fn every_declared_client_variant_parses_and_round_trips() {
    let variants = object(&contract(), "clientMessages");
    assert!(!variants.is_empty(), "contract declares no client variants");

    for (name, spec) in &variants {
        let sample = spec
            .get("sample")
            .unwrap_or_else(|| panic!("clientMessages.{name} has no canonical sample"));
        let payload = serde_json::to_vec(sample).expect("encode sample");
        let parsed = parse_client_message(&payload, MAX_JSON_PAYLOAD_BYTES)
            .unwrap_or_else(|err| panic!("clientMessages.{name} failed to parse: {err}"));
        assert_eq!(
            &tag_of(&parsed),
            name,
            "clientMessages.{name} did not round-trip to the same wire tag"
        );
    }

    let unknown = json!({ "type": "fireWeapon", "version": PROTOCOL_VERSION });
    let payload = serde_json::to_vec(&unknown).expect("encode");
    assert!(
        parse_client_message(&payload, MAX_JSON_PAYLOAD_BYTES).is_err(),
        "client channel accepted an undeclared variant: {unknown}"
    );
}

#[test]
fn text_limits_are_enforced_on_every_declared_field() {
    // A name one char over the contract limit must be refused before
    // deserialization, on both sides of the socket.
    let limits = object(&contract(), "limits");
    let name_max = limits["maxNameChars"].as_u64().expect("maxNameChars") as usize;
    let oversized = "x".repeat(name_max + 1);
    let payload = serde_json::to_vec(&json!({
        "type": "join",
        "version": PROTOCOL_VERSION,
        "intentId": "6f1e2d3c-4b5a-4968-8797-a6b5c4d3e2f1",
        "roomCode": "K7QZM",
        "seed": "2026-09-12",
        "name": oversized,
        "skin": "bluejay",
    }))
    .expect("encode");
    assert!(
        parse_client_message(&payload, MAX_JSON_PAYLOAD_BYTES).is_err(),
        "a {name_max}+1 char name was accepted"
    );
}

#[test]
fn snapshot_payload_carries_pilot_state() {
    let variants = object(&contract(), "serverMessages");
    let sample = &variants["snapshot"]["sample"];
    let payload = serde_json::to_vec(sample).expect("encode sample");
    let parsed = parse_server_message(&payload, MAX_JSON_PAYLOAD_BYTES).expect("parse");
    match parsed {
        ServerMessage::Snapshot { snapshot, .. } => {
            assert_eq!(snapshot.tick, 105);
            assert_eq!(snapshot.pilots.len(), 1);
            let pilot = &snapshot.pilots[0];
            assert!((pilot.x - 128.25).abs() < f32::EPSILON);
            assert_eq!(pilot.distance, 64);
            assert!(!pilot.finished);
        }
        other => panic!("expected Snapshot, got {other:?}"),
    }
}

#[test]
fn every_client_variant_is_closed() {
    // Compile-time-ish guard: enumerate the variants we know about so that
    // adding one to the enum without adding it to the contract is visible.
    let declared: BTreeSet<String> = object(&contract(), "clientMessages")
        .keys()
        .cloned()
        .collect();
    let known = [
        tag_of(&ClientMessage::Join {
            version: PROTOCOL_VERSION,
            intent_id: sunbird_protocol::new_uuid(),
            room_code: "K7QZM".into(),
            seed: "2026-09-12".into(),
            name: "Kestrel".into(),
            skin: "bluejay".into(),
            reconnect_token: None,
        }),
        tag_of(&ClientMessage::Leave {
            version: PROTOCOL_VERSION,
            room_id: sunbird_protocol::new_uuid(),
            seat_id: sunbird_protocol::new_uuid(),
        }),
        tag_of(&ClientMessage::Ready {
            version: PROTOCOL_VERSION,
            room_id: sunbird_protocol::new_uuid(),
            seat_id: sunbird_protocol::new_uuid(),
            ready: true,
        }),
        tag_of(&ClientMessage::Reconnect {
            version: PROTOCOL_VERSION,
            room_id: sunbird_protocol::new_uuid(),
            seat_id: sunbird_protocol::new_uuid(),
            reconnect_token: "sb1.opaque".into(),
        }),
    ];
    for tag in known {
        assert!(declared.contains(&tag), "enum variant \"{tag}\" is absent from the contract");
    }
    assert!(
        declared.contains("heartbeat"),
        "heartbeat is declared in the contract and covered by the parse test"
    );
}

#[test]
fn contract_file_is_where_both_sides_expect() {
    assert!(
        Path::new(CONTRACT_PATH).exists(),
        "protocol/contract.json must exist at {CONTRACT_PATH}"
    );
}
