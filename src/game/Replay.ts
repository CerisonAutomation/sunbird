export type RunOptions = { duel?: boolean; challenge?: "" | "daily" | `gauntlet${number}`; event?: boolean; storm?: boolean };

/** All replay entry points retain the run's rules; completed one-shot goals
 * return to the mode rather than advertising a reward that was already claimed. */
export function replayOptions(run: {
  duel: boolean; challenge: string; dailyDone: boolean; gauntletDone: number[]; event: boolean; storm: boolean;
}): RunOptions {
  if (run.duel) return { duel: true };
  if (run.challenge === "daily" && !run.dailyDone) return { challenge: "daily" };
  const stage = /^gauntlet(\d+)$/.exec(run.challenge);
  if (stage && !run.gauntletDone.includes(Number(stage[1]))) return { challenge: `gauntlet${Number(stage[1])}` };
  if (run.event) return { event: true };
  if (run.storm) return { storm: true };
  return {};
}
