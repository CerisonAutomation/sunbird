export type ModeId = "daytrip" | "race" | "zenith" | "distance" | "coinrush" | "perfect" | "endless" | "daily" | "weekly" | "timetrial" | "marathon" | "survival";

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
    clock: 52,
    finish: 0,
    scoreBy: "distance",
    escalate: false,
  },
  {
    id: "race",
    name: "Race",
    blurb: "First to the finish line 3,000 m out. Every second counts.",
    icon: "🏁",
    clock: 0,
    finish: 3000,
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
    icon: "🪙",
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
    id: "daily",
    name: "Daily Challenge",
    blurb: "Same hill as everyone — beat the daily best",
    icon: "📅",
    clock: 0,
    finish: 0,
    scoreBy: "distance",
    escalate: false,
  },
  {
    id: "weekly",
    name: "Weekly Tournament",
    blurb: "7-day competition — highest score wins",
    icon: "🏆",
    clock: 0,
    finish: 0,
    scoreBy: "distance",
    escalate: false,
  },
  {
    id: "timetrial",
    name: "Time Trial",
    blurb: "Race against the clock — fastest distance wins",
    icon: "⏱️",
    clock: 60,
    finish: 0,
    scoreBy: "distance",
    escalate: false,
  },
  {
    id: "marathon",
    name: "Marathon",
    blurb: "How far can you fly? No sunset, no limits",
    icon: "🏃",
    clock: 0,
    finish: 0,
    scoreBy: "distance",
    escalate: false,
  },
  {
    id: "survival",
    name: "Survival",
    blurb: "One life — how many islands can you reach?",
    icon: "💀",
    clock: 0,
    finish: 0,
    scoreBy: "distance",
    escalate: false,
  },
];

export function modeById(id: ModeId): ModeDef {
  return MODES.find((m) => m.id === id) ?? MODES[0]!;
}

export const RACE_FINISH = 3000;
