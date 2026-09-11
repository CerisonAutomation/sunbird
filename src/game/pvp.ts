/**
 * PvP helpers — pure functions only, no DOM, no save access.
 *
 * Everything here describes the *on-device* Rival rating earned in the
 * simulated 40-bird field. It is never presented as a global/server rank:
 * every label carries the word "local" or "practice". Server-authoritative
 * ranking stays deferred until a real backend owns results.
 */

export type RivalMatch = {
  place: number;
  field: number;
  mode: string;
  date: string;
  won: boolean;
};

export type RivalState = {
  rating: number;
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
  matches: RivalMatch[];
};

export type Division = {
  id: string;
  name: string;
  icon: string;
  min: number;
  max: number;
};

export const DIVISIONS: Division[] = [
  { id: "fledgling", name: "Fledgling", icon: "🐣", min: 0, max: 1099 },
  { id: "glider", name: "Glider", icon: "🪶", min: 1100, max: 1249 },
  { id: "racer", name: "Sky Racer", icon: "🌤️", min: 1250, max: 1399 },
  { id: "ace", name: "Sky Ace", icon: "⚡", min: 1400, max: 1549 },
  { id: "legend", name: "Sunbird Legend", icon: "👑", min: 1550, max: 1_000_000 },
];

export const RIVAL_BASE_RATING = 1000;
export const RIVAL_K = 26;

export function divisionFor(rating: number): Division {
  const r = Math.max(0, Math.floor(rating));
  return DIVISIONS.find((d) => r >= d.min && r <= d.max) ?? DIVISIONS[DIVISIONS.length - 1]!;
}

export function nextDivision(rating: number): { div: Division; needed: number } | null {
  const r = Math.max(0, Math.floor(rating));
  const next = DIVISIONS.find((d) => r < d.min);
  if (!next) return null;
  return { div: next, needed: next.min - r };
}

/**
 * Elo-style delta against the whole field, treated as one composite
 * opponent at rating 1000 + field strength. Beating 40 pilots pays more
 * than beating 8. Returns a signed integer, wins positive.
 */
export function ratingDelta(place: number, field: number): number {
  const p = Math.max(1, Math.min(field, Math.floor(place)));
  const f = Math.max(2, Math.floor(field));
  const score = (f - p) / (f - 1); // 1.0 win … 0.0 last
  return Math.round(RIVAL_K * (score - 0.5) * 2);
}

/** Streak bonus coins actually granted on a ranked win. Capped, honest. */
export function streakBonus(streak: number): number {
  if (streak < 2) return 0;
  return Math.min(60, 10 * streak);
}

export type PvpMode = {
  id: "ranked" | "casual" | "local" | "practice";
  name: string;
  icon: string;
  blurb: string;
  scope: string;
  rated: boolean;
};

export const PVP_MODES: PvpMode[] = [
  {
    id: "ranked",
    name: "Ranked 40",
    icon: "🏆",
    blurb: "Full field. Your on-device Rival rating moves with every finish.",
    scope: "Solo · simulated field",
    rated: true,
  },
  {
    id: "casual",
    name: "Casual 40",
    icon: "🐦",
    blurb: "Same pack, zero pressure. Rating frozen — fly loose.",
    scope: "Solo · simulated field",
    rated: false,
  },
  {
    id: "local",
    name: "Local Versus",
    icon: "👥",
    blurb: "Two pilots, one screen. Pass-and-play or split input.",
    scope: "Local · 2 players",
    rated: false,
  },
  {
    id: "practice",
    name: "Practice",
    icon: "🌅",
    blurb: "Empty skies. Learn the hills with no pack and no clock.",
    scope: "Solo · no rivals",
    rated: false,
  },
];

export function pvpModeLabel(id: string): string {
  return PVP_MODES.find((m) => m.id === id)?.name ?? "Ranked 40";
}

const RIVAL_NAMES = [
  "Aria", "Kestrel", "Nomi", "Tavi", "Wren", "Bex", "Juno", "Pike", "Sable", "Fen",
  "Rook", "Vale", "Ivy", "Cass", "Odin", "Lux",
];

/**
 * Deterministic featured rivals for the pre-race lobby, drawn from the same
 * name pool as the simulated field. Clearly local pilots, never live players.
 */
export function featuredRivals(seed: string, count = 3): { name: string; tag: string }[] {
  let h = 2166136261;
  const s = `${seed}:rivals`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out: { name: string; tag: string }[] = [];
  let x = h >>> 0 || 1;
  const tags = ["dives late", "climbs hard", "draft hunter", "steady wings", "crest sniper"];
  while (out.length < count) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    const name = RIVAL_NAMES[x % RIVAL_NAMES.length]!;
    if (out.some((r) => r.name === name)) continue;
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    out.push({ name, tag: tags[x % tags.length]! });
  }
  return out;
}

export function medalFor(place: number): string {
  if (place === 1) return "🥇";
  if (place === 2) return "🥈";
  if (place === 3) return "🥉";
  return `#${place}`;
}

export function escapeHtml(v: string): string {
  return v.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

export function defaultRival(): RivalState {
  return { rating: RIVAL_BASE_RATING, wins: 0, losses: 0, streak: 0, bestStreak: 0, matches: [] };
}

/* ------------------------------------------------------------- seasons */

/** Ranked seasons roll monthly, matching the Nest Pass cadence. */
export function rankSeasonId(d = new Date()): string {
  return `R${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Soft reset applied at each season rollover: ratings drift halfway back to
 * base so climbing stays meaningful without erasing a season of work.
 */
export function softResetRating(rating: number): number {
  return Math.round((Math.max(0, rating) + RIVAL_BASE_RATING) / 2);
}

/** End-of-season coin reward for the peak division reached. */
export function seasonReward(peakRating: number): { coins: number; division: Division } {
  const div = divisionFor(peakRating);
  const idx = DIVISIONS.findIndex((d) => d.id === div.id);
  return { coins: 60 + idx * 70, division: div };
}

/* --------------------------------------------------------------- duels */

/**
 * Duel matchmaking (local): map the player's rating onto an opponent skill
 * multiplier so a Legend faces a genuinely sharper pilot than a Fledgling.
 */
export function duelSkillFor(rating: number): number {
  const r = Math.max(0, rating);
  return Math.min(1.4, Math.max(0.55, 0.6 + (r - RIVAL_BASE_RATING) / 800));
}

/** Deterministic duel opponent for a given seed + rating band. */
export function duelOpponent(seed: string, rating: number): { name: string; tag: string; rating: number } {
  const picks = featuredRivals(`${seed}:duel`, 1);
  const base = picks[0] ?? { name: "Kestrel", tag: "steady wings" };
  // Opponent rating shown in the lobby: your band, ± a small seeded offset.
  let h = 5381;
  const s = `${seed}:duelr`;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  const jitter = ((h >>> 0) % 121) - 60;
  return { ...base, rating: Math.max(0, Math.round(rating + jitter)) };
}
