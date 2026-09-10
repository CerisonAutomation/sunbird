import { clamp, lerp, SeededRandom } from "./math";
import type { SaveData } from "./SaveData";

/* ============================================================ flow tuning */

/**
 * Keeps challenge tracking skill (Csikszentmihalyi's flow band).
 *
 * Rather than a fixed difficulty curve, we hold a rolling estimate of how well
 * this particular player flies and nudge terrain scale toward the edge of their
 * ability: bored players get punchier hills, struggling players get gentler
 * ones. The adjustment is deliberately slow and tightly clamped so the world
 * never feels like it is playing itself.
 */
export class FlowTuner {
  /** 0 = brand new, 1 = expert. Persisted across sessions. */
  skill = 0.25;
  private samples = 0;

  load(save: SaveData): void {
    this.skill = clamp(save.state.skill ?? 0.25, 0, 1);
    this.samples = save.state.skillSamples ?? 0;
  }

  /** Rate a finished run and fold it into the estimate. */
  noteRun(distance: number, perfects: number, launches: number, save: SaveData): void {
    // Three independent signals, each saturating so one lucky run can't spike it.
    const fDist = clamp(distance / 2600, 0, 1);
    const fRate = launches > 0 ? clamp(perfects / Math.max(3, launches), 0, 1) : 0;
    const fVol = clamp(launches / 22, 0, 1);
    const observed = fDist * 0.45 + fRate * 0.35 + fVol * 0.2;

    // Early runs move the estimate faster so new players calibrate quickly.
    this.samples += 1;
    const rate = this.samples < 5 ? 0.34 : 0.12;
    this.skill = clamp(lerp(this.skill, observed, rate), 0, 1);
    save.state.skill = this.skill;
    save.state.skillSamples = this.samples;
    save.persist();
  }

  /**
   * Terrain scale multiplier. Beginners get slightly longer, gentler arches;
   * experts get tighter, steeper ones that demand real timing.
   */
  difficulty(): number {
    return lerp(0.86, 1.16, this.skill);
  }

  label(): string {
    if (this.skill < 0.2) return "Fledgling";
    if (this.skill < 0.4) return "Glider";
    if (this.skill < 0.6) return "Skyrider";
    if (this.skill < 0.8) return "Windmaster";
    return "Sunbird";
  }
}

/* ========================================================== session goals */

export type GoalKind = "distance" | "perfects" | "combo" | "altitude" | "coins" | "clouds" | "gems";

export type SessionGoal = {
  id: string;
  kind: GoalKind;
  target: number;
  label: string;
  reward: number;
  progress: number;
  done: boolean;
};

export type GoalProgress = Record<GoalKind, number>;

const GOAL_SHAPES: { kind: GoalKind; base: number; scale: number; word: (n: number) => string }[] = [
  { kind: "distance", base: 700, scale: 1400, word: (n) => `Fly ${Math.round(n)} m in one run` },
  { kind: "perfects", base: 2, scale: 6, word: (n) => `Land ${n} perfect launches` },
  { kind: "combo", base: 2, scale: 4, word: (n) => `Reach a ×${n} launch chain` },
  { kind: "altitude", base: 45, scale: 130, word: (n) => `Climb to ${Math.round(n)} m altitude` },
  { kind: "coins", base: 12, scale: 34, word: (n) => `Collect ${Math.round(n)} coins` },
  { kind: "clouds", base: 2, scale: 6, word: (n) => `Touch ${n} clouds` },
  { kind: "gems", base: 1, scale: 3, word: (n) => `Grab ${n} sky gems` },
];

/**
 * A rolling set of three short goals.
 *
 * The Zeigarnik effect says unfinished tasks stay mentally "open" — so the list
 * is never allowed to empty. The instant one is completed it is replaced, which
 * means the player always leaves a run with something still in progress.
 * Targets scale with measured skill so they sit just past current ability.
 */
export class SessionGoals {
  goals: SessionGoal[] = [];
  private seq = 0;

  constructor(private readonly tuner: FlowTuner) {}

  reset(seed: string): void {
    this.seq = 0;
    this.goals = [];
    const rng = new SeededRandom(`${seed}:goals`);
    const used = new Set<GoalKind>();
    while (this.goals.length < 3) this.goals.push(this.make(rng, used));
  }

  private make(rng: SeededRandom, used: Set<GoalKind>): SessionGoal {
    let shape = GOAL_SHAPES[rng.int(0, GOAL_SHAPES.length)]!;
    let guard = 0;
    while (used.has(shape.kind) && guard++ < 24) shape = GOAL_SHAPES[rng.int(0, GOAL_SHAPES.length)]!;
    used.add(shape.kind);
    const s = this.tuner.skill;
    // Target lands a little beyond what this player usually manages.
    const raw = shape.base + shape.scale * (0.35 + s * 0.75) * rng.range(0.85, 1.15);
    const target = shape.kind === "distance" || shape.kind === "altitude" || shape.kind === "coins"
      ? Math.round(raw / 5) * 5
      : Math.max(1, Math.round(raw));
    return {
      id: `g${this.seq++}`,
      kind: shape.kind,
      target,
      label: shape.word(target),
      reward: Math.round(25 + target * (shape.kind === "distance" ? 0.03 : shape.kind === "altitude" ? 0.25 : 8)),
      progress: 0,
      done: false,
    };
  }

  /** @returns goals completed by this update (already replaced in the list). */
  update(p: GoalProgress): SessionGoal[] {
    const finished: SessionGoal[] = [];
    const rng = new SeededRandom(`${Date.now()}:${this.seq}`);
    for (let i = 0; i < this.goals.length; i++) {
      const g = this.goals[i]!;
      if (g.done) continue;
      g.progress = p[g.kind] ?? 0;
      if (g.progress >= g.target) {
        g.done = true;
        finished.push(g);
        // Refill immediately — the list must never be empty.
        const used = new Set(this.goals.map((x) => x.kind));
        used.delete(g.kind);
        this.goals[i] = this.make(rng, used);
      }
    }
    return finished;
  }

  /** The goal closest to completion, for the "almost there" nudge. */
  closest(): SessionGoal | null {
    let best: SessionGoal | null = null;
    let bestFrac = -1;
    for (const g of this.goals) {
      if (g.done) continue;
      const f = g.progress / g.target;
      if (f > bestFrac) {
        bestFrac = f;
        best = g;
      }
    }
    return bestFrac >= 0.55 ? best : null;
  }
}

/* ============================================================== near miss */

export type NearMiss = { kind: "distance" | "altitude" | "combo" | "none"; gap: number; text: string };

/**
 * The single most reliable "one more go" trigger in the literature: showing the
 * player how *close* they came. We only fire it when the shortfall is genuinely
 * small, so it reads as honest feedback rather than manufactured tension.
 */
export function evaluateNearMiss(
  distance: number,
  bestDistance: number,
  altitude: number,
  bestAltitude: number,
  combo: number,
  bestCombo: number,
): NearMiss {
  if (bestDistance > 100 && distance < bestDistance) {
    const gap = bestDistance - distance;
    if (gap / bestDistance <= 0.12) return { kind: "distance", gap, text: `${Math.ceil(gap)} m short of your best!` };
  }
  if (bestAltitude > 40 && altitude < bestAltitude) {
    const gap = bestAltitude - altitude;
    if (gap / bestAltitude <= 0.1) return { kind: "altitude", gap, text: `${Math.ceil(gap)} m below your altitude record!` };
  }
  if (bestCombo >= 3 && combo === bestCombo - 1) {
    return { kind: "combo", gap: 1, text: "One launch away from your best chain!" };
  }
  return { kind: "none", gap: 0, text: "" };
}
