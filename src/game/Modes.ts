export type ModeId = "daytrip" | "race" | "zenith" | "distance" | "coinrush" | "perfect" | "endless" | "massrace";

export type ModeDef = {
  id: ModeId;
  name: string;
  blurb: string;
  icon: string;
  /** seconds of daylight, or 0 for "no clock" */
  clock: number;
  /** finish line in metres, or 0 for endless */
  finish: number;
  /** what the end screen celebrates */
  scoreBy: "distance" | "altitude" | "coins" | "perfects" | "time";
  /** difficulty ramps with distance */
  escalate: boolean;
};

export const MODES: ModeDef[] = [
  {
    id: "daytrip",
    name: "Day Trip",
    blurb: "Chase the sunset across the islands. Reach land to win back daylight.",
    icon: "☀",
    clock: 70,
    finish: 0,
    scoreBy: "distance",
    escalate: false,
  },
  {
    id: "race",
    name: "Race",
    blurb: "First to the finish line 4,000 m out. Every second counts.",
    icon: "🏁",
    clock: 0,
    finish: 4000,
    scoreBy: "time",
    escalate: false,
  },
  {
    id: "zenith",
    name: "Zenith",
    blurb: "Ninety seconds to launch as high as the sky allows.",
    icon: "🚀",
    clock: 90,
    finish: 0,
    scoreBy: "altitude",
    escalate: false,
  },
  {
    id: "distance",
    name: "Distance",
    blurb: "One fixed sunset. Keep your momentum and go far.",
    icon: "📏",
    clock: 75,
    finish: 0,
    scoreBy: "distance",
    escalate: false,
  },
  {
    id: "coinrush",
    name: "Coin Rush",
    blurb: "Sixty seconds. Every coin counts double.",
    icon: "💰",
    clock: 60,
    finish: 0,
    scoreBy: "coins",
    escalate: false,
  },
  {
    id: "perfect",
    name: "Perfect Run",
    blurb: "Score comes almost entirely from chaining perfect launches.",
    icon: "✦",
    clock: 80,
    finish: 0,
    scoreBy: "perfects",
    escalate: false,
  },
  {
    id: "endless",
    name: "Endless",
    blurb: "No clock. The hills just keep getting faster.",
    icon: "∞",
    clock: 0,
    finish: 0,
    scoreBy: "distance",
    escalate: true,
  },
  {
    id: "massrace",
    name: "Mass Race · 40",
    blurb: "A full 40-bird field on identical hills. Out-fly the pack to the line.",
    icon: "🐦",
    clock: 0,
    finish: 4000,
    scoreBy: "time",
    escalate: false,
  },
];

/** Rival count for the mass-race grid (plus you = 41 birds in the air). */
export const MASS_RACE_FIELD = 40;

export function modeById(id: ModeId): ModeDef {
  return MODES.find((m) => m.id === id) ?? MODES[0]!;
}

/** Finish distance for the local 2-player split-screen versus, matched to the
 * online mass race so every PvP surface gets the same, unhurried pacing. */
export const RACE_FINISH = 4000;
