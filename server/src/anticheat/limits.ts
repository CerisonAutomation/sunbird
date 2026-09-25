/**
 * Physical + plausibility limits for score and input validation.
 *
 * Values are mirrored from the client's own anti-cheat
 * (`src/game/AntiCheat.ts`) and the wire contract (`protocol/contract.json`
 * → `movement`), so the server and the client can never disagree about what
 * is physically possible:
 *   • MAX_SPEED_FEVER (128) × wingboost (1.5) + BOOST_EXTRA_SPEED (42) = 234 u/s
 *   • 15 Hz tick × 2 headroom → 31 u per-tick state delta ceiling
 *   • 120 m/s theoretical max bird speed, ≥500 ms per 100 m
 */

export const LIMITS = {
  /* score submission ceilings (LEADERBOARD_API.md plausibility gates) */
  maxDistance: 500_000,
  maxDistancePlausible: 60_000,
  maxAltitude: 10_000,
  maxPerfects: 5_000,
  maxCoins: 100_000,
  maxScore: 5_000_000,
  maxRunDurationMs: 20 * 60_000,
  minRunDurationMs: 1_000,
  /** avg speed ceiling (m/s) — from client AntiCheat MAX_SPEED_MPS. */
  maxAvgSpeedMps: 120,
  /** minimum ms per 100 m — from client AntiCheat MIN_DURATION_MS_PER_100M. */
  minMsPer100m: 500,
  /** score density: score ≤ distance × 1000 + 100k — client AntiCheat. */
  scoreDensityFactor: 1000,
  scoreDensityBase: 100_000,
  /** api gate: score ≤ distance × 40 + 50k (LEADERBOARD_API.md). */
  apiScoreFactor: 40,
  apiScoreBase: 50_000,

  /* movement envelope — mirrored from protocol/contract.json `movement` */
  tickHz: 15,
  maxSpeedUnitsPerSec: 234,
  maxStateDeltaXPerTick: 31,
  maxStateDeltaYPerTick: 31,
  maxCoordinateAbs: 1_000_000,
  maxAltitudeAbs: 100_000,
  maxRotationAbs: 12.5664,
  distanceRegressionTolerance: 0.5,

  /* input cadence */
  /** hard per-seat message ceiling (any frame type) */
  maxMessagesPerSec: 40,
  /** sustained state-frame cadence = 2× the 15 Hz send rate */
  maxStatePerSec: 30,
} as const;

export type ScoreValidation = { ok: boolean; reason?: string };

/**
 * Full plausibility check for a submitted run. Combines the client's
 * physics gates with the leaderboard API's plausibility gates — the
 * strictest combination wins, so a payload that fooled one side still
 * fails here.
 */
export function validateScoreSubmission(input: {
  distance: number;
  altitude: number;
  perfects: number;
  coins: number;
  score: number;
  durationMs: number;
}): ScoreValidation {
  const { distance, altitude, perfects, coins, score, durationMs } = input;

  if (![distance, altitude, perfects, coins, score, durationMs].every(Number.isFinite)) {
    return { ok: false, reason: "non-finite telemetry" };
  }
  if (distance < 0 || altitude < 0 || perfects < 0 || coins < 0 || score < 0 || durationMs < 0) {
    return { ok: false, reason: "negative telemetry" };
  }
  if (distance > LIMITS.maxDistance) return { ok: false, reason: "distance above physical ceiling" };
  if (altitude > LIMITS.maxAltitude) return { ok: false, reason: "altitude above physical ceiling" };
  if (perfects > LIMITS.maxPerfects) return { ok: false, reason: "perfects above physical ceiling" };
  if (coins > LIMITS.maxCoins) return { ok: false, reason: "coins above physical ceiling" };
  if (score > LIMITS.maxScore) return { ok: false, reason: "score above physical ceiling" };
  if (distance > 0 && (durationMs < LIMITS.minRunDurationMs || durationMs > LIMITS.maxRunDurationMs)) {
    return { ok: false, reason: "implausible run duration" };
  }
  if (distance > LIMITS.maxDistancePlausible) return { ok: false, reason: "implausible distance" };
  if (score > distance * LIMITS.apiScoreFactor + LIMITS.apiScoreBase) return { ok: false, reason: "implausible score" };

  if (distance > 100) {
    const avgSpeed = distance / (durationMs / 1000);
    if (avgSpeed > LIMITS.maxAvgSpeedMps) {
      return { ok: false, reason: `unrealistic average speed (${avgSpeed.toFixed(1)} m/s)` };
    }
    const minMs = (distance / 100) * LIMITS.minMsPer100m;
    if (durationMs < minMs) return { ok: false, reason: "impossible run duration for distance" };
  }
  if (distance > 0 && score > distance * LIMITS.scoreDensityFactor + LIMITS.scoreDensityBase) {
    return { ok: false, reason: "score density exceeds physical threshold" };
  }
  return { ok: true };
}

/** Deterministic score derived by the server from an authoritative distance. */
export function serverScoreFor(distance: number): number {
  return Math.round(distance * 1.4);
}
