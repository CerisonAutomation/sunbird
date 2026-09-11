use anyhow::{anyhow, Context, Result};
use hmac::{digest::KeyInit, Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::time::Duration;
use time::OffsetDateTime;
use uuid::Uuid;

pub const TOKEN_PREFIX_V1: &str = "sb1";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SeatClaims {
    pub v: u32,
    pub player_id: Uuid,
    pub room_id: Uuid,
    pub seat_id: Uuid,
    pub generation: u64,
    pub issued_at_unix: i64,
    pub expires_at_unix: i64,
}

#[derive(Clone)]
pub struct SeatTokenIssuer {
    key: Vec<u8>,
    ttl: Duration,
}

impl SeatTokenIssuer {
    pub fn new(secret: &[u8], ttl: Duration) -> Self {
        Self {
            key: secret.to_vec(),
            ttl,
        }
    }

    pub fn issue(
        &self,
        player_id: Uuid,
        room_id: Uuid,
        seat_id: Uuid,
        generation: u64,
    ) -> Result<String> {
        let now = OffsetDateTime::now_utc();
        self.issue_at(player_id, room_id, seat_id, generation, now)
    }

    fn issue_at(
        &self,
        player_id: Uuid,
        room_id: Uuid,
        seat_id: Uuid,
        generation: u64,
        issued: OffsetDateTime,
    ) -> Result<String> {
        let claims = SeatClaims {
            v: sunbird_protocol::PROTOCOL_VERSION,
            player_id,
            room_id,
            seat_id,
            generation,
            issued_at_unix: issued.unix_timestamp(),
            expires_at_unix: (issued + self.ttl).unix_timestamp(),
        };
        let payload = serde_json::to_vec(&claims).context("failed to encode seat claims")?;
        let payload64 =
            base64::Engine::encode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, payload);
        let signature = self.sign(payload64.as_bytes())?;
        Ok(format!("{TOKEN_PREFIX_V1}.{payload64}.{signature}"))
    }

    pub fn verify(&self, token: &str) -> Result<SeatClaims> {
        let mut parts = token.splitn(3, '.');
        let prefix = parts
            .next()
            .ok_or_else(|| anyhow!("token format is invalid"))?;
        let payload64 = parts
            .next()
            .ok_or_else(|| anyhow!("token format is invalid"))?;
        let signature = parts
            .next()
            .ok_or_else(|| anyhow!("token format is invalid"))?;
        if prefix != TOKEN_PREFIX_V1 {
            return Err(anyhow!("unsupported token prefix"));
        }
        let expected = self.sign(payload64.as_bytes())?;
        if !constant_time_eq(expected.as_bytes(), signature.as_bytes()) {
            return Err(anyhow!("token signature mismatch"));
        }
        let payload =
            base64::Engine::decode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, payload64)
                .context("invalid token payload")?;
        let claims: SeatClaims =
            serde_json::from_slice(&payload).context("invalid token claims")?;
        if claims.v != sunbird_protocol::PROTOCOL_VERSION {
            return Err(anyhow!("unsupported claim version"));
        }
        if OffsetDateTime::now_utc().unix_timestamp() > claims.expires_at_unix {
            return Err(anyhow!("token expired"));
        }
        Ok(claims)
    }

    fn sign(&self, payload: &[u8]) -> Result<String> {
        let mut mac = <HmacSha256 as Mac>::new_from_slice(&self.key)
            .map_err(|_| anyhow!("invalid signing key"))?;
        mac.update(payload);
        Ok(hex::encode(mac.finalize().into_bytes()))
    }
}

type HmacSha256 = Hmac<Sha256>;

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    let length = left.len().max(right.len());
    let mut diff = (left.len() ^ right.len()) as u8;
    for index in 0..length {
        let a = left.get(index).copied().unwrap_or_default();
        let b = right.get(index).copied().unwrap_or_default();
        diff |= a ^ b;
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn issue_and_verify() {
        let issuer = SeatTokenIssuer::new(
            b"01234567890123456789012345678901",
            Duration::from_secs(300),
        );
        let player = Uuid::new_v4();
        let room = Uuid::new_v4();
        let seat = Uuid::new_v4();
        let token = issuer.issue(player, room, seat, 7).expect("issue token");
        let claims = issuer.verify(&token).expect("verify token");
        assert_eq!(claims.player_id, player);
        assert_eq!(claims.room_id, room);
        assert_eq!(claims.seat_id, seat);
        assert_eq!(claims.generation, 7);
    }

    #[test]
    fn tampered_token_rejected() {
        let issuer = SeatTokenIssuer::new(
            b"01234567890123456789012345678901",
            Duration::from_secs(300),
        );
        let token = issuer
            .issue(Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4(), 1)
            .expect("issue");
        let mut bad = token.clone();
        bad.replace_range(token.len() - 1.., "0");
        assert!(issuer.verify(&bad).is_err());
    }

    #[test]
    fn wrong_prefix_rejected() {
        let issuer = SeatTokenIssuer::new(
            b"01234567890123456789012345678901",
            Duration::from_secs(300),
        );
        assert!(issuer.verify("sb0.x.y").is_err());
    }
}
