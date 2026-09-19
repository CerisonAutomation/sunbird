/**
 * Opaque reconnect tokens for race seats: `sbseat.<base64url payload>.<sig>`.
 * Bound to (playerId, seatId, generation) so a captured token is useless on
 * a fresh seat or after the client reconnects (generation bump).
 */
import { signToken, verifyToken } from "../util/crypto.js";

const KIND = "sbseat";
const SKEW_MS = 24 * 86_400_000; // seats are short-lived; tokens stay valid a day

export function signReconnectToken(
  secret: string,
  playerId: string,
  seatId: string,
  generation: number,
): string {
  return signToken(KIND, secret, {
    p: playerId,
    s: seatId,
    g: generation,
    iat: Date.now(),
    exp: Date.now() + SKEW_MS,
  });
}

export function verifyReconnectToken(
  secret: string,
  playerId: string,
  seatId: string,
  generation: number,
  token: string,
): boolean {
  const payload = verifyToken(KIND, secret, token, SKEW_MS);
  if (!payload) return false;
  return payload.p === playerId && payload.s === seatId && payload.g === generation;
}
