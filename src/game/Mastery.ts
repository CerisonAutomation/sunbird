import { MODES } from "./Modes";
import type { SaveData } from "./SaveData";

/**
 * Per-mode mastery: every run in a mode banks progress toward five mastery
 * levels. Rewards are paid in coins immediately on level-up — nothing is
 * decorative, and nothing needs a server.
 */

export const MASTERY_LEVELS = [3, 10, 25, 50, 100];
export const MASTERY_REWARDS = [40, 80, 150, 250, 400];

export type MasteryView = {
  modeId: string;
  name: string;
  icon: string;
  runs: number;
  level: number;
  nextAt: number | null;
  progress: number;
};

export function masteryLevel(runs: number): number {
  let lvl = 0;
  for (const need of MASTERY_LEVELS) if (runs >= need) lvl++;
  return lvl;
}

export function masteryViews(save: SaveData): MasteryView[] {
  return MODES.map((m) => {
    const runs = save.state.mastery[m.id] ?? 0;
    const level = masteryLevel(runs);
    const nextAt = level < MASTERY_LEVELS.length ? MASTERY_LEVELS[level]! : null;
    const prevAt = level > 0 ? MASTERY_LEVELS[level - 1]! : 0;
    const progress = nextAt ? Math.min(1, (runs - prevAt) / (nextAt - prevAt)) : 1;
    return { modeId: m.id, name: m.name, icon: m.icon, runs, level, nextAt, progress };
  });
}

/** Called after a run: banks the run, returns a reward if a level was crossed. */
export function bankMasteryRun(save: SaveData, modeId: string): { level: number; coins: number } | null {
  const before = masteryLevel(save.state.mastery[modeId] ?? 0);
  const runs = save.addMasteryRun(modeId);
  const after = masteryLevel(runs);
  if (after <= before) return null;
  const coins = MASTERY_REWARDS[after - 1] ?? 100;
  save.addCoins(coins);
  return { level: after, coins };
}
