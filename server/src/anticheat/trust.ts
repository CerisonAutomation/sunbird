/**
 * Trust layer: signed session tokens, short-lived match tokens, and client
 * version pinning.
 *
 * Session tokens   — HMAC-signed, 7-day TTL, per player. Carried as
 *                    `Authorization: Bearer <token>` on every /api/v1 route.
 * Match tokens     — HMAC-signed, 10-minute TTL, bound to (player, matchId,
 *                    roomCode). Required to submit authoritative race
 *                    results, so a stolen generic session can't post a fake
 *                    race result into a room it never raced.
 * Version pinning  — clients send `x-client-build`; when SUNBIRD_CLIENT_BUILD
 *                    is set, unknown builds are rejected on write routes.
 */
import type { Config } from "../config.js";
import { signToken, verifyToken } from "../util/crypto.js";

export const SESSION_TTL_MS = 7 * 86_400_000;
export const MATCH_TOKEN_TTL_MS = 10 * 60_000;

export type SessionClaims = { sub: string; iat: number; exp: number };
export type MatchClaims = { sub: string; matchId: string; roomCode: string; iat: number; exp: number };

export class Trust {
  constructor(private readonly cfg: Config) {}

  signSession(playerId: string, nowMs = Date.now()): string {
    const claims: SessionClaims = { sub: playerId, iat: nowMs, exp: nowMs + SESSION_TTL_MS };
    return signToken("sb1", this.cfg.tokenSecret, claims as unknown as Record<string, unknown>);
  }

  verifySession(token: string, revoked: (t: string) => boolean): string | null {
    if (revoked(token)) return null;
    const payload = verifyToken("sb1", this.cfg.tokenSecret, token, SESSION_TTL_MS);
    if (!payload) return null;
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    return sub && sub.startsWith("p_") ? sub : null;
  }

  signMatch(playerId: string, matchId: string, roomCode: string, nowMs = Date.now()): string {
    const claims: MatchClaims = { sub: playerId, matchId, roomCode, iat: nowMs, exp: nowMs + MATCH_TOKEN_TTL_MS };
    return signToken("sbm", this.cfg.tokenSecret, claims as unknown as Record<string, unknown>);
  }

  verifyMatch(
    token: string,
    playerId: string,
    matchId: string,
    roomCode: string,
  ): boolean {
    const payload = verifyToken("sbm", this.cfg.tokenSecret, token, MATCH_TOKEN_TTL_MS);
    if (!payload) return false;
    return payload.sub === playerId && payload.matchId === matchId && payload.roomCode === roomCode;
  }

  /**
   * Client build pinning. `build` is the `x-client-build` header value.
   * Returns true when the client may write. Reads are always allowed (a
   * stale client should still be able to see the board, just not post).
   */
  clientBuildAllowed(_build: string | null, write: boolean): boolean {
    if (!this.cfg.clientBuildId || this.cfg.clientBuildId === "unpinned") return true;
    if (!write) return true;
    return _build === this.cfg.clientBuildId;
  }
}
