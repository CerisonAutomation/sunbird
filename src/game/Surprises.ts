/**
 * Surprises — the "did that just happen?!" engine.
 *
 * Slot-machine psychology, but generous: rare delightful events fire during
 * ordinary flight so no two runs feel identical. Every surprise is
 * strictly positive or neutral-funny — surprises never punish, because
 * random punishment reads as unfair and breaks flow.
 *
 * Design rules:
 *  - at most ONE surprise per run window (45s cooldown) so they stay special
 *  - probability ramps with distance flown, so long runs earn more delight
 *  - all rolls go through a caller-provided RNG hook for testability
 */

export type SurpriseKind =
  | "golden-goose" // a golden goose flies past honking, drops a coin shower
  | "tailwind" // sudden friendly tailwind + slide whistle
  | "sneeze" // the bird sneezes mid-air. That's it. That's the feature.
  | "coin-comet" // a comet of coins streaks overhead
  | "photobomb" // a giant fish photobombs a jump over water
  | "encore"; // the music flips to fever mode for 8s, free

export type Surprise = {
  kind: SurpriseKind;
  toast: string;
  /** coins granted immediately (0 for pure-comedy events) */
  coins: number;
  /** seconds of free fever, 0 if none */
  feverSeconds: number;
};

const POOL: { kind: SurpriseKind; weight: number; toasts: string[]; coins: number; fever: number }[] = [
  {
    kind: "golden-goose",
    weight: 3,
    toasts: ["🦢 A golden goose honks past — it's raining coins!", "🦢 The golden goose approves of your form!"],
    coins: 25,
    fever: 0,
  },
  {
    kind: "tailwind",
    weight: 5,
    toasts: ["💨 Freak tailwind! The sky is on your side", "💨 The wind remembered it owes you one"],
    coins: 0,
    fever: 0,
  },
  {
    kind: "sneeze",
    weight: 4,
    toasts: ["🤧 The bird sneezed. Aerodynamics unaffected. Dignity: lost", "🤧 Achoo! Feathers everywhere"],
    coins: 0,
    fever: 0,
  },
  {
    kind: "coin-comet",
    weight: 3,
    toasts: ["☄ A coin comet streaks by — grab the debris!", "☄ Coin comet! Someone up there likes you"],
    coins: 15,
    fever: 0,
  },
  {
    kind: "photobomb",
    weight: 2,
    toasts: ["🐟 A fish photobombed your jump. It will tell its friends", "🐟 That fish has seen things"],
    coins: 5,
    fever: 0,
  },
  {
    kind: "encore",
    weight: 3,
    toasts: ["🎶 The band plays an encore — free fever!", "🎶 Surprise encore! Ride the beat"],
    coins: 0,
    fever: 8,
  },
];

const COOLDOWN_S = 45;
/** No surprises in the first stretch — let the player settle into the run. */
const MIN_DISTANCE_M = 320;

export class SurpriseEngine {
  private cooldown = 0;
  private fired = 0;

  reset(): void {
    this.cooldown = 18; // small warm-up before the first one is possible
    this.fired = 0;
  }

  /**
   * Call once per second-ish of flight. Returns a surprise to perform, or
   * null. `rng` is injected for determinism in tests.
   */
  tick(dt: number, distance: number, airborne: boolean, rng: () => number = Math.random): Surprise | null {
    this.cooldown -= dt;
    if (this.cooldown > 0 || !airborne || distance < MIN_DISTANCE_M) return null;
    // Base 1.2%/check, ramping slightly with distance; capped so it stays rare.
    const p = Math.min(0.035, 0.012 + distance / 220_000);
    if (rng() >= p) return null;
    this.cooldown = COOLDOWN_S * (1 + this.fired * 0.5); // each one rarer than the last
    this.fired += 1;
    return pickSurprise(rng);
  }
}

export function pickSurprise(rng: () => number = Math.random): Surprise {
  const total = POOL.reduce((a, e) => a + e.weight, 0);
  let roll = rng() * total;
  let entry = POOL[POOL.length - 1]!;
  for (const e of POOL) {
    roll -= e.weight;
    if (roll <= 0) {
      entry = e;
      break;
    }
  }
  const toast = entry.toasts[Math.floor(rng() * entry.toasts.length)] ?? entry.toasts[0]!;
  return { kind: entry.kind, toast, coins: entry.coins, feverSeconds: entry.fever };
}

/* ------------------------------------------------------------------ */
/* Comedy flavour lines: sprinkled into ordinary moments.             */
/* ------------------------------------------------------------------ */

export const SPLASH_QUIPS = [
  "The ocean: 1 · Bird: 0",
  "That was a swan dive. You are not a swan",
  "The fish demand an apology",
  "Water landing! The geese are laughing",
  "Soggy. Judged. 6/10 for commitment",
  "The tide does not respect your personal best",
  "You've invented swimming. Reluctantly",
  "Somewhere a beach umbrella just closed in sympathy",
];

export const SLEEP_QUIPS = [
  "The sun clocked out. So did the bird",
  "Nap time is undefeated",
  "Zzz… dreaming of thermals",
  "Filed under: birds who almost made it",
  "The horizon won this round",
  "Somewhere, a worm sighs in relief",
  "Sleep now. Revenge at sunrise",
  "The bird has left the flight simulator",
  "You flew until the sky filed for overtime",
  "The moon is covering your shift. Badly",
  "Eyelids heavier than the headwind",
  "Gravity tucked you in without asking",
];

export const BIG_LAUNCH_QUIPS = [
  "The hill said YEET",
  "FAA would like a word",
  "Gravity has filed a complaint",
  "That wasn't flying. That was leaving",
  "NASA called. They want notes",
  "The clouds are pressing charges",
  "Physics rage-quit",
  "Air traffic control has questions",
  "Local bird breaks sound barrier, polite about it",
  "The ground waved bye-bye",
  "That launch had a lawyer on retainer",
  "Momentum called dibs on you",
];

/** Fresh pool: fever ignites. */
export const FEVER_QUIPS = [
  "The bird has entered its villain arc",
  "Somewhere, the sun is taking notes",
  "MAXIMUM BIRB",
  "This is legally a heatwave now",
  "The clouds are just spectators at this point",
  "Molten. Fully molten",
];

/** Fresh pool: sky-gem pickups. */
export const GEM_QUIPS = [
  "That gem has been waiting its whole life for this",
  "Sparkly. Like a very fast disco",
  "The gem squealed. You heard nothing",
  "One more and the ocean gets jealous",
  "Polished to perfection — now it's yours",
];

/** Fresh pool: distance milestones. */
export const MILESTONE_QUIPS = [
  "The horizon just got smaller",
  "Your legs are a rumor now",
  "Distance: legally considered 'far'",
  "The map is updating its notes on you",
  "You're collecting horizon, one flap at a time",
  "Somewhere a mile marker salutes",
];

/** Fresh pool: giving up mid-run. */
export const SURRENDER_QUIPS = [
  "The bird has chosen dignity. Bold move",
  "Retreat? We call it 'tactical sunshine'",
  "The sky will tell tales of your almost-flight",
  "You can't lose if you're just resting. That's the rule",
  "The worm breathes easy once more",
  "Abort mission. The sun looked at us funny",
];

/** Deterministic quip pick so tests can pin behaviour. */
export function quip(pool: string[], n: number): string {
  return pool[Math.abs(n) % pool.length] ?? pool[0]!;
}
