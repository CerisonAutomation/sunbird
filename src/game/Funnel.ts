/**
 * Funnel — the honest answer to "where did they go?".
 *
 * A flight game only has a handful of seconds to convert a portal visitor into
 * somebody who flies a second time, and every one of those seconds is a stage
 * somebody can drop out of: the boot, the first touch, the first launch, the
 * first coin, the first laugh, the first death, the first retry. Without
 * timestamps per stage, "players don't come back" is a rumour; with them, it is
 * a number you can point at and fix.
 *
 * This module is deliberately dumb and dependency-free (no DOM, no SaveData, no
 * telemetry import): it records *when* each stage was first reached and answers
 * questions about the shape of the session. `Game.ts` owns sending the events,
 * so nothing here can fire twice or leak player data — there is no identifier
 * of any kind in a `Funnel`, only milliseconds.
 *
 * Stage order is fixed and meaningful: `FUNNEL_STAGES` is the path every
 * player walks, so "last stage reached" *is* the drop-off point.
 */

/** The retention path, in the order a new player meets it. */
export const FUNNEL_STAGES = [
  "boot",
  "first_input",
  "first_flight",
  "first_reward",
  "first_moment",
  "first_death",
  "first_retry",
  "second_run",
] as const;

export type FunnelStage = (typeof FUNNEL_STAGES)[number];

/** One funnel event as sent to telemetry. */
export type FunnelEvent = {
  stage: FunnelStage;
  /** Index of `stage` in `FUNNEL_STAGES` (0-based). Travels with the coarse
   * telemetry beacon so a backend can order the funnel without keeping its own
   * copy of the stage list — the list is fixed, but a copy of it would drift. */
  step: number;
  /** Milliseconds since the funnel started (boot). */
  ms: number;
  /** Milliseconds since the previous stage was reached (0 for `boot`). */
  stepMs: number;
  /** How much of the path this stage completes, 0..1. */
  progress: number;
};

/** Which stage a session stalled at, and how long it sat there. */
export type DropOff = { stage: FunnelStage; step: number; afterMs: number; stuckForMs: number };

export class Funnel {
  private readonly marks = new Map<FunnelStage, number>();
  private startedAt = Number.NaN;

  /** Starts the clock. Idempotent: a second call never moves the origin. */
  start(now = Date.now()): void {
    if (Number.isNaN(this.startedAt)) this.startedAt = now;
  }

  /**
   * Records a stage. @returns an event the first time the stage is reached and
   * `null` afterwards, so callers can wire this straight into telemetry without
   * their own once-flags (and without ever double-counting a stage).
   */
  mark(stage: FunnelStage, now = Date.now()): FunnelEvent | null {
    this.start(now);
    if (this.marks.has(stage)) return null;
    const ms = Math.max(0, Math.round(now - this.startedAt));
    this.marks.set(stage, ms);
    const idx = FUNNEL_STAGES.indexOf(stage);
    const prev = idx > 0 ? this.marks.get(FUNNEL_STAGES[idx - 1]) : undefined;
    return {
      stage,
      step: idx < 0 ? 0 : idx,
      ms,
      stepMs: prev === undefined ? 0 : Math.max(0, ms - prev),
      progress: (idx + 1) / FUNNEL_STAGES.length,
    };
  }

  reached(stage: FunnelStage): boolean {
    return this.marks.has(stage);
  }

  /** Milliseconds since boot when `stage` was reached, or `null`. */
  at(stage: FunnelStage): number | null {
    return this.marks.get(stage) ?? null;
  }

  /** The furthest stage reached — `null` when nothing has been marked. */
  last(): FunnelStage | null {
    for (let i = FUNNEL_STAGES.length - 1; i >= 0; i -= 1) {
      const stage = FUNNEL_STAGES[i];
      if (this.marks.has(stage)) return stage;
    }
    return null;
  }

  /** Stages reached, in path order (a compact "how far did they get" string). */
  path(): FunnelStage[] {
    return FUNNEL_STAGES.filter((s) => this.marks.has(s));
  }

  /** 0..1 completion of the whole path. */
  progress(): number {
    return this.marks.size / FUNNEL_STAGES.length;
  }

  /**
   * Where this session stalled: the last stage reached, how long after boot it
   * happened, and how long the session has been sitting there.
   *
   * The "stuck" number is what makes this actionable — `first_flight` reached
   * but no `first_reward` for 90 seconds is a different bug from no
   * `first_input` at all, and only the gap tells them apart.
   */
  dropOff(now = Date.now()): DropOff | null {
    const stage = this.last();
    if (!stage) return null;
    const afterMs = this.marks.get(stage) ?? 0;
    return {
      stage,
      step: Math.max(0, FUNNEL_STAGES.indexOf(stage)),
      afterMs,
      stuckForMs: Math.max(0, Math.round(now - this.startedAt) - afterMs),
    };
  }

  /** Flat `{ stage: ms }` for one end-of-session beacon. */
  toJSON(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [stage, ms] of this.marks) out[stage] = ms;
    return out;
  }

  /** Clears every mark (a fresh session, e.g. after a save reset). */
  reset(): void {
    this.marks.clear();
    this.startedAt = Number.NaN;
  }
}

/* ------------------------------------------------------------------ cohort */

export type VisitKind = "new" | "d1" | "d2_6" | "d7plus";

/** Whole days between two `YYYY-MM-DD` keys, clamped at zero. */
export function daysBetween(from: string, to: string): number {
  if (!from || !to) return 0;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/**
 * Retention cohort for today's visit.
 *
 * `"new"` = first ever session (no recorded first day, or first day is today),
 * `"d1"` = came back the next day (the number every portal dashboard cares
 * about), `"d2_6"` = the fragile middle, `"d7plus"` = a habit.
 *
 * Days are calendar days in the player's own timezone — the same clock the
 * streak and the login calendar already use — so a "day 1" here means the same
 * thing as a "day 1" everywhere else in the game.
 */
export function visitKind(firstPlayed: string, today: string): VisitKind {
  if (!firstPlayed) return "new";
  const days = daysBetween(firstPlayed, today);
  if (days <= 0) return "new";
  if (days === 1) return "d1";
  if (days < 7) return "d2_6";
  return "d7plus";
}
