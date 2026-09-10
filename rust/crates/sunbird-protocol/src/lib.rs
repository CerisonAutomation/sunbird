//! SUNBIRD protocol v1.
//!
//! Rust is the protocol source of truth. The TypeScript validator in
//! `src/game/protocol/v1.ts` mirrors these models and their limits.
//!
//! Phase 1 intentionally covers only the control handshake/control-channel
//! models. Authoritative race movement/results are added in Phase 2+ and must
//! never be represented by an unversioned client payload.
//!
//! Payload contract:
//! - JSON only
//! - `version: 1` on every message
//! - maximum frame size: 8 KiB before deserialization
//! - unknown variants must be rejected by the client parser; the Rust enum is
//!   closed by design.

use serde::{Deserialize, Serialize};
use thiserror::Error;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;

pub const PROTOCOL_VERSION: u32 = 1;
pub const PROTOCOL_MIN_VERSION: u32 = 1;
pub const MAX_JSON_PAYLOAD_BYTES: usize = 8 * 1024;
pub const MAX_NAME_CHARS: usize = 14;
pub const MAX_ROOM_CODE_CHARS: usize = 5;
pub const MAX_SEED_CHARS: usize = 64;
pub const MAX_SKIN_CHARS: usize = 32;
pub const MAX_IDEMPOTENCY_CHARS: usize = 80;
pub const MAX_ERROR_MESSAGE_CHARS: usize = 256;
pub const SESSION_MIN_TOKEN_CHARS: usize = 16;
pub const SESSION_MAX_TOKEN_CHARS: usize = 512;

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Limits {
    pub version: u32,
    pub max_json_payload_bytes: usize,
    pub max_name_chars: usize,
}

impl Limits {
    pub fn current() -> Self {
        Self {
            version: PROTOCOL_VERSION,
            max_json_payload_bytes: MAX_JSON_PAYLOAD_BYTES,
            max_name_chars: MAX_NAME_CHARS,
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PilotPublic {
    #[serde(default, with = "time::serde::rfc3339::option")]
    pub joined_at: Option<OffsetDateTime>,
    pub id: Uuid,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub skin: String,
    #[serde(default)]
    pub ready: bool,
    #[serde(default)]
    pub reconnecting: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomPublic {
    pub id: Uuid,
    #[serde(default)]
    pub code: String,
    #[serde(default)]
    pub seed: String,
    pub capacity: u32,
    pub host_seat_id: Uuid,
    #[serde(default)]
    pub pilots: Vec<PilotPublic>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeatGrant {
    pub room_id: Uuid,
    pub seat_id: Uuid,
    pub player_id: Uuid,
    pub generation: u64,
    pub reconnect_token: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerSnapshot {
    #[serde(with = "time::serde::rfc3339")]
    pub server_time: OffsetDateTime,
    pub tick: u64,
    #[serde(default)]
    pub pilots: Vec<SnapshotPilot>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotPilot {
    pub seat_id: Uuid,
    pub x: f32,
    pub y: f32,
    pub rotation: f32,
    pub distance: u64,
    #[serde(default)]
    pub finished: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ClientMessage {
    #[serde(rename_all = "camelCase")]
    Join {
        version: u32,
        intent_id: Uuid,
        #[serde(default)]
        room_code: String,
        seed: String,
        name: String,
        skin: String,
        #[serde(default)]
        reconnect_token: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    Leave { version: u32, room_id: Uuid, seat_id: Uuid },
    #[serde(rename_all = "camelCase")]
    Ready { version: u32, room_id: Uuid, seat_id: Uuid, ready: bool },
    #[serde(rename_all = "camelCase")]
    Heartbeat {
        version: u32,
        room_id: Uuid,
        seat_id: Uuid,
        sequence: u64,
        #[serde(with = "time::serde::rfc3339")]
        client_time: OffsetDateTime,
    },
    #[serde(rename_all = "camelCase")]
    Reconnect {
        version: u32,
        room_id: Uuid,
        seat_id: Uuid,
        reconnect_token: String,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ServerMessage {
    #[serde(rename_all = "camelCase")]
    Hello {
        version: u32,
        server_name: String,
        limits: Limits,
    },
    #[serde(rename_all = "camelCase")]
    Welcome {
        version: u32,
        grant: SeatGrant,
        room: RoomPublic,
    },
    #[serde(rename_all = "camelCase")]
    RosterUpdate { version: u32, room: RoomPublic },
    #[serde(rename_all = "camelCase")]
    Started {
        version: u32,
        room_id: Uuid,
        #[serde(with = "time::serde::rfc3339")]
        start_at: OffsetDateTime,
        seed: String,
    },
    #[serde(rename_all = "camelCase")]
    Snapshot { version: u32, snapshot: ServerSnapshot },
    #[serde(rename_all = "camelCase")]
    Error { version: u32, error: ProtocolError },
}

#[derive(Clone, Debug, PartialEq, Eq, Error, Serialize, Deserialize)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum ProtocolError {
    #[error("protocol version {version} is unsupported")]
    #[serde(rename_all = "camelCase")]
    UnsupportedVersion { version: u32, min_supported: u32 },
    #[error("message is invalid: {reason}")]
    #[serde(rename_all = "camelCase")]
    InvalidMessage { reason: String },
    #[error("payload exceeded {max_bytes} bytes")]
    #[serde(rename_all = "camelCase")]
    PayloadTooLarge { max_bytes: usize },
    #[error("rate limited; retry after {retry_after_ms} ms")]
    #[serde(rename_all = "camelCase")]
    RateLimited { retry_after_ms: u64 },
    #[error("room is full")]
    RoomFull,
    #[error("room was not found")]
    RoomNotFound,
    #[error("seat was not found")]
    SeatNotFound,
    #[error("reconnect token is invalid")]
    InvalidReconnectToken,
    #[error("server rejected the request: {message}")]
    #[serde(rename_all = "camelCase")]
    Rejected { message: String },
}

#[derive(Clone, Debug, PartialEq, Eq, Error)]
pub enum ValidationError {
    #[error("unsupported protocol version {0}")]
    UnsupportedVersion(u32),
    #[error("UTF-8 message is not valid JSON")
    ]
    InvalidJson,
    #[error("JSON parse failed: {0}")]
    Parse(#[from] serde_json::Error),
    #[error("field length violation: {0}")]
    TextLimit(&'static str),
    #[error("byte payload exceeded limit")]
    PayloadTooLarge,
}

pub fn parse_client_message(payload: &[u8], max_bytes: usize) -> Result<ClientMessage, ValidationError> {
    if payload.len() > max_bytes {
        return Err(ValidationError::PayloadTooLarge);
    }
    let value: serde_json::Value = serde_json::from_slice(payload).map_err(|_| ValidationError::InvalidJson)?;
    validate_message_value(&value)?;
    Ok(serde_json::from_value(value)?)
}

pub fn parse_server_message(payload: &[u8], max_bytes: usize) -> Result<ServerMessage, ValidationError> {
    if payload.len() > max_bytes {
        return Err(ValidationError::PayloadTooLarge);
    }
    let value: serde_json::Value = serde_json::from_slice(payload).map_err(|_| ValidationError::InvalidJson)?;
    validate_message_value(&value)?;
    Ok(serde_json::from_value(value)?)
}

fn validate_message_value(value: &serde_json::Value) -> Result<(), ValidationError> {
    let obj = value.as_object().ok_or(ValidationError::InvalidJson)?;
    let version = obj
        .get("version")
        .and_then(serde_json::Value::as_u64)
        .ok_or(ValidationError::InvalidJson)? as u32;
    if version != PROTOCOL_VERSION {
        return Err(ValidationError::UnsupportedVersion(version));
    }
    check_len(obj, "name", MAX_NAME_CHARS)?;
    check_len(obj, "roomCode", MAX_ROOM_CODE_CHARS)?;
    check_len(obj, "seed", MAX_SEED_CHARS)?;
    check_len(obj, "skin", MAX_SKIN_CHARS)?;
    check_len(obj, "reconnectToken", SESSION_MAX_TOKEN_CHARS)?;
    check_len(obj, "message", MAX_ERROR_MESSAGE_CHARS)?;
    Ok(())
}

fn check_len(obj: &serde_json::Map<String, serde_json::Value>, key: &'static str, max: usize) -> Result<(), ValidationError> {
    if let Some(serde_json::Value::String(text)) = obj.get(key) {
        if text.chars().count() > max {
            return Err(ValidationError::TextLimit(key));
        }
    }
    Ok(())
}

pub fn sanitize_text(input: &str, max_chars: usize) -> String {
    input
        .chars()
        .filter(|c| !c.is_control() || *c == '\n' || *c == '\t')
        .take(max_chars)
        .collect::<String>()
        .trim()
        .to_string()
}

pub fn rfc3339_now() -> String {
    OffsetDateTime::now_utc().format(&Rfc3339).unwrap_or_default()
}

pub fn new_uuid() -> Uuid {
    Uuid::new_v4()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn join_round_trip() {
        let intent = Uuid::new_v4();
        let msg = ClientMessage::Join {
            version: PROTOCOL_VERSION,
            intent_id: intent,
            room_code: "ABCDE".into(),
            seed: "2026-01-01".into(),
            name: "Kestrel".into(),
            skin: "bluejay".into(),
            reconnect_token: None,
        };
        let payload = serde_json::to_vec(&msg).expect("encode");
        let decoded = parse_client_message(&payload, MAX_JSON_PAYLOAD_BYTES).expect("parse");
        assert_eq!(decoded, msg);
    }

    #[test]
    fn rejects_oversized_payload_before_deserialize() {
        let payload = vec![b'{'; MAX_JSON_PAYLOAD_BYTES + 1];
        assert!(matches!(
            parse_client_message(&payload, MAX_JSON_PAYLOAD_BYTES),
            Err(ValidationError::PayloadTooLarge)
        ));
    }

    #[test]
    fn rejects_wrong_version() {
        let payload = serde_json::to_vec(&json!({
            "type": "join",
            "version": 2,
            "intentId": Uuid::new_v4().to_string(),
            "roomCode": "ABC",
            "seed": "x",
            "name": "Pilot"
        }))
        .expect("encode");
        assert!(matches!(
            parse_client_message(&payload, MAX_JSON_PAYLOAD_BYTES),
            Err(ValidationError::UnsupportedVersion(2))
        ));
    }

    #[test]
    fn rejects_text_over_limit() {
        let payload = serde_json::to_vec(&json!({
            "type": "join",
            "version": 1,
            "intentId": Uuid::new_v4().to_string(),
            "roomCode": "ABCDEF",
            "seed": "x",
            "name": "Pilot"
        }))
        .expect("encode");
        assert!(matches!(
            parse_client_message(&payload, MAX_JSON_PAYLOAD_BYTES),
            Err(ValidationError::TextLimit("roomCode"))
        ));
    }

    #[test]
    fn server_welcome_shape_is_tagged() {
        let grant = SeatGrant {
            room_id: Uuid::new_v4(),
            seat_id: Uuid::new_v4(),
            player_id: Uuid::new_v4(),
            generation: 1,
            reconnect_token: "opaque".into(),
        };
        let room = RoomPublic {
            id: grant.room_id,
            code: "ABCDE".into(),
            seed: "seed".into(),
            capacity: 40,
            host_seat_id: grant.seat_id,
            pilots: Vec::new(),
        };
        let value = serde_json::to_value(ServerMessage::Welcome {
            version: PROTOCOL_VERSION,
            grant,
            room,
        })
        .expect("encode");
        assert_eq!(value["type"], "welcome");
        assert_eq!(value["version"], 1);
    }
}
