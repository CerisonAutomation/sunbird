import { GAP_START } from "./constants";

export type DecoKind =
  | "tree"
  | "palm"
  | "pine"
  | "spire"
  | "crystal"
  | "cactus"
  | "flower"
  | "rock"
  | "mushroom"
  | "bush"
  | "lantern"
  | "coral"
  | "ruin"
  | "lighthouse"
  | "windmill"
  | "candy";
export type HazardKind = "none" | "gust" | "storm";
export type HillStyle = "rolling" | "sharp" | "plateau" | "wave" | "jagged";

export type BiomeDef = {
  id: string;
  name: string;
  tagline: string;
  emoji: string;
  /** hill amplitude / wavelength multipliers — the feel of the world */
  amp: number;
  wave: number;
  /** hill shape personality — how the cosine arches are combined */
  hillStyle: HillStyle;
  /** terrain vertex colours */
  top: number;
  ridge: number;
  mid: number;
  deep: number;
  sand: number;
  /** far parallax silhouettes */
  farA: number;
  farB: number;
  farC: number;
  /** sky tint blended over the time-of-day gradient */
  skyTop: number;
  skyHorizon: number;
  skyMix: number;
  /** cloud tint + how busy the sky is */
  cloudTint: number;
  cloudDensity: number;
  snowLine: number;
  deco: DecoKind;
  secondaryDeco: DecoKind;
  decoDensity: number;
  hazard: HazardKind;
  thermals: number;
  fogTint: number;
  /** night worlds glow their collectibles */
  glow: boolean;
  /** musical colour for this world */
  musicMode: "bright" | "warm" | "airy" | "wide" | "night" | "crystal";
};

/**
 * Six hand-tuned worlds. They cycle as you cross islands, and each one changes
 * how the hills *play*, not just how they look.
 */
export const BIOMES: BiomeDef[] = [
  {
    id: "green",
    name: "Green Hills",
    tagline: "Gentle rollers — the perfect place to learn the rhythm",
    emoji: "🌿",
    amp: 0.92,
    wave: 1,
    hillStyle: "rolling",
    top: 0x86dc7e,
    ridge: 0x4aa85c,
    mid: 0x2f7d5b,
    deep: 0x1d4d4a,
    sand: 0xd8b681,
    farA: 0x6bb87a,
    farB: 0x4d8aaa,
    farC: 0x4a68a0,
    skyTop: 0x4aa8f0,
    skyHorizon: 0xbfe8ff,
    skyMix: 0.25,
    cloudTint: 0xffffff,
    cloudDensity: 0.19,
    snowLine: 0,
    deco: "tree",
    secondaryDeco: "flower",
    decoDensity: 1,
    hazard: "none",
    thermals: 2,
    fogTint: 0xffffff,
    glow: false,
    musicMode: "bright",
  },
  {
    id: "sunset",
    name: "Sunset Ridge",
    tagline: "Long violet valleys and warm, fast air",
    emoji: "🌇",
    amp: 1.12,
    wave: 1.22,
    hillStyle: "wave",
    top: 0xd98ac0,
    ridge: 0x9a5a9e,
    mid: 0x5f3a7a,
    deep: 0x33224e,
    sand: 0xe8a877,
    farA: 0xc46a8a,
    farB: 0x8a4a80,
    farC: 0x4a3060,
    skyTop: 0xf0784a,
    skyHorizon: 0xffc79a,
    skyMix: 0.55,
    cloudTint: 0xffc8a0,
    cloudDensity: 0.17,
    snowLine: 0,
    deco: "pine",
    secondaryDeco: "bush",
    decoDensity: 0.8,
    hazard: "none",
    thermals: 3,
    fogTint: 0xffb890,
    glow: false,
    musicMode: "warm",
  },
  {
    id: "tropical",
    name: "Tropical Atoll",
    tagline: "Turquoise water between bright island hills",
    emoji: "🏝",
    amp: 0.98,
    wave: 0.92,
    hillStyle: "rolling",
    top: 0x7ff0b0,
    ridge: 0x35c48a,
    mid: 0x1f8f80,
    deep: 0x14555e,
    sand: 0xfff0c0,
    farA: 0x54d6b0,
    farB: 0x2f9ec0,
    farC: 0x2a6ea8,
    skyTop: 0x30d0e8,
    skyHorizon: 0xd8fbff,
    skyMix: 0.4,
    cloudTint: 0xe8ffff,
    cloudDensity: 0.22,
    snowLine: 0,
    deco: "palm",
    secondaryDeco: "coral",
    decoDensity: 1.1,
    hazard: "none",
    thermals: 4,
    fogTint: 0xc8fff0,
    glow: false,
    musicMode: "airy",
  },
  {
    id: "desert",
    name: "Dune Sea",
    tagline: "Enormous ramps and long, long air",
    emoji: "🏜",
    amp: 1.3,
    wave: 1.45,
    hillStyle: "sharp",
    top: 0xf2cf7a,
    ridge: 0xdc9a4a,
    mid: 0xb0603a,
    deep: 0x6a3524,
    sand: 0xf7e6b8,
    farA: 0xd8a86a,
    farB: 0xb46a4a,
    farC: 0x8a4a52,
    skyTop: 0xf0a850,
    skyHorizon: 0xffe6b0,
    skyMix: 0.42,
    cloudTint: 0xffe8c8,
    cloudDensity: 0.11,
    snowLine: 0,
    deco: "cactus",
    secondaryDeco: "rock",
    decoDensity: 0.5,
    hazard: "none",
    thermals: 6,
    fogTint: 0xffdca0,
    glow: false,
    musicMode: "wide",
  },
  {
    id: "night",
    name: "Midnight Coast",
    tagline: "Glowing collectibles under a quiet moon",
    emoji: "🌙",
    amp: 1.08,
    wave: 1.05,
    hillStyle: "plateau",
    top: 0x3f5a8a,
    ridge: 0x2c3f68,
    mid: 0x1d2848,
    deep: 0x10162c,
    sand: 0x54648a,
    farA: 0x2a3c66,
    farB: 0x1e2a4c,
    farC: 0x141c34,
    skyTop: 0x0d1030,
    skyHorizon: 0x2a2f60,
    skyMix: 0.75,
    cloudTint: 0x8090c8,
    cloudDensity: 0.14,
    snowLine: 0,
    deco: "pine",
    secondaryDeco: "lantern",
    decoDensity: 0.9,
    hazard: "storm",
    thermals: 3,
    fogTint: 0x2a3054,
    glow: true,
    musicMode: "night",
  },
  {
    id: "aurora",
    name: "Aurora Peaks",
    tagline: "Ice ramps that fire you into the northern lights",
    emoji: "🔮",
    amp: 1.42,
    wave: 1.12,
    hillStyle: "jagged",
    top: 0xe6f7ff,
    ridge: 0x9fd0ee,
    mid: 0x5a7fc0,
    deep: 0x2c3a72,
    sand: 0xdcebff,
    farA: 0x7a9ed8,
    farB: 0x5a68b8,
    farC: 0x3a3f80,
    skyTop: 0x1b2a68,
    skyHorizon: 0x62e8c8,
    skyMix: 0.6,
    cloudTint: 0xd8fff4,
    cloudDensity: 0.15,
    snowLine: 26,
    deco: "crystal",
    secondaryDeco: "mushroom",
    decoDensity: 0.95,
    hazard: "gust",
    thermals: 4,
    fogTint: 0xbfe8ff,
    glow: true,
    musicMode: "crystal",
  },
  {
    id: "volcano",
    name: "Volcanic Ridge",
    tagline: "Molten rivers and explosive launches",
    emoji: "🌋",
    amp: 1.5,
    wave: 1.3,
    hillStyle: "sharp",
    top: 0x8a2a1a,
    ridge: 0xcc4422,
    mid: 0x661a0a,
    deep: 0x330a04,
    sand: 0x5a2a1a,
    farA: 0x8a2a1a,
    farB: 0x661a0a,
    farC: 0x330a04,
    skyTop: 0x4a1a0a,
    skyHorizon: 0xff6633,
    skyMix: 0.5,
    cloudTint: 0xff8844,
    cloudDensity: 0.13,
    snowLine: 0,
    deco: "spire",
    secondaryDeco: "crystal",
    decoDensity: 0.6,
    hazard: "storm",
    thermals: 8,
    fogTint: 0x4a1a0a,
    glow: true,
    musicMode: "wide",
  },
  {
    id: "ice",
    name: "Frozen Peaks",
    tagline: "Crystal ice ramps and slippery slopes",
    emoji: "❄️",
    amp: 1.2,
    wave: 1.1,
    hillStyle: "jagged",
    top: 0xe8f4ff,
    ridge: 0x88bbee,
    mid: 0x4488aa,
    deep: 0x224466,
    sand: 0xd0e8f0,
    farA: 0x88bbee,
    farB: 0x4488aa,
    farC: 0x224466,
    skyTop: 0xaaccff,
    skyHorizon: 0xe8f4ff,
    skyMix: 0.35,
    cloudTint: 0xe8f4ff,
    cloudDensity: 0.9,
    snowLine: 10,
    deco: "crystal",
    secondaryDeco: "pine",
    decoDensity: 1.2,
    hazard: "gust",
    thermals: 2,
    fogTint: 0xcce8ff,
    glow: false,
    musicMode: "crystal",
  },
  {
    id: "candy",
    name: "Sweet Valley",
    tagline: "Gumdrop hills and lollipop trees",
    emoji: "🍬",
    amp: 0.85,
    wave: 0.95,
    hillStyle: "rolling",
    top: 0xff88cc,
    ridge: 0xcc44aa,
    mid: 0x882288,
    deep: 0x441144,
    sand: 0xffccee,
    farA: 0xcc44aa,
    farB: 0x882288,
    farC: 0x441144,
    skyTop: 0xff88dd,
    skyHorizon: 0xffccee,
    skyMix: 0.4,
    cloudTint: 0xffccee,
    cloudDensity: 1.1,
    snowLine: 0,
    deco: "flower",
    secondaryDeco: "candy",
    decoDensity: 1.5,
    hazard: "none",
    thermals: 3,
    fogTint: 0xffccee,
    glow: true,
    musicMode: "bright",
  },
  {
    id: "space",
    name: "Starfield",
    tagline: "Zero-gravity floating through cosmic dust",
    emoji: "🌌",
    amp: 0.7,
    wave: 0.8,
    hillStyle: "plateau",
    top: 0x0a0820,
    ridge: 0x1a1040,
    mid: 0x0a0818,
    deep: 0x050410,
    sand: 0x1a1030,
    farA: 0x1a1040,
    farB: 0x0a0818,
    farC: 0x050410,
    skyTop: 0x020108,
    skyHorizon: 0x1a1040,
    skyMix: 0.8,
    cloudTint: 0x222244,
    cloudDensity: 0.5,
    snowLine: 0,
    deco: "crystal",
    secondaryDeco: "spire",
    decoDensity: 0.4,
    hazard: "none",
    thermals: 6,
    fogTint: 0x0a0820,
    glow: true,
    musicMode: "night",
  },
];

export function biomeForIsland(island: number): BiomeDef {
  return BIOMES[((island % BIOMES.length) + BIOMES.length) % BIOMES.length]!;
}

/** Difficulty tier: every full lap of the world cycle raises the stakes. */
export function tierForIsland(island: number): number {
  return Math.floor(Math.max(0, island) / BIOMES.length);
}

/** Ocean gap widens gradually with distance (capped so it stays crossable). */
export function gapEndFor(island: number): number {
  return GAP_START + 148 + Math.min(64, island * 7);
}

/** Launch ramp peak grows with the gap it has to clear. */
export function rampPeakFor(island: number): number {
  return 28 + Math.min(18, island * 2);
}
