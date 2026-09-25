import { createHash, randomBytes } from "node:crypto";

/** Unambiguous room-code alphabet (no 0/O or 1/I) — matches the client. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomHex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

/** Short unique id with a kind prefix, e.g. `p_3f9c…` / `seat_…` / `m_…`. */
export function randomId(prefix: string): string {
  return `${prefix}_${randomHex(12)}`;
}

/** Five-char room code, collision-checked against `taken`. */
export function makeRoomCode(taken: (code: string) => boolean): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = "";
    for (let i = 0; i < 5; i++) code += CODE_ALPHABET[randomBytes(1)[0] % CODE_ALPHABET.length];
    if (!taken(code)) return code;
  }
  // Practically unreachable; fall back to entropy directly.
  return randomId("code").replace(/[^A-Z0-9]/g, "").slice(0, 5).toUpperCase();
}

/** 5-char invite code for squads (same alphabet). */
export function makeSquadInviteCode(): string {
  let code = "";
  for (let i = 0; i < 5; i++) code += CODE_ALPHABET[randomBytes(1)[0] % CODE_ALPHABET.length];
  return code;
}

/**
 * Derive a human-shareable player code (`SUN-XXXXXX`) from a playerId.
 * Deterministic: the same pilot always has the same code, and it never
 * exposes the raw id (6 hex chars of a SHA-256 digest).
 */
export function playerCodeFor(playerId: string): string {
  const digest = createHash("sha256").update(`sunbird:code:${playerId}`).digest("hex");
  const clean = digest.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return `SUN-${clean.slice(0, 6)}`;
}

/** Daily seed used for public rooms / daily boards, e.g. `2026-09-15`. */
export function dailySeed(now = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** ISO week key, Monday-anchored, e.g. `2026-W38` — matches the client. */
export function weekKey(now = Date.now()): string {
  const d = new Date(now);
  const day = d.getDay() || 7;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + 1);
  const yearStart = new Date(monday.getFullYear(), 0, 1);
  const week = Math.ceil(((monday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${monday.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Monthly season id, e.g. `2026-09` — matches the client's rank season cadence. */
export function seasonId(now = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
