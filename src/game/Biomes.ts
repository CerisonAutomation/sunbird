import { GAP_START } from "./constants";

export type DecoKind = "tree" | "palm" | "pine" | "spire" | "crystal" | "cactus";
/** Rare monument props placed ~1 chunk in 8 (see TerrainSystem.placeDecor). */
export type LandmarkKind = "ancient" | "stones" | "arch";
export type HazardKind = "none" | "gust" | "storm";

export type BiomeDef = {
  id: string;
  name: string;
  tagline: string;
  emoji: string;
  /** hill amplitude / wavelength multipliers — the feel of the world */
  amp: number;
  wave: number;
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
    cloudDensity: 1,
    snowLine: 0,
    deco: "tree",
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
    cloudDensity: 0.9,
    snowLine: 0,
    deco: "pine",
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
    cloudDensity: 1.15,
    snowLine: 0,
    deco: "palm",
    decoDensity: 1.1,
    hazard: "none",
    thermals: 4,
    fogTint: 0xc8fff0,
    glow: false,
    musicMode: "airy",
  },
  {
    id: "reef",
    name: "Coral Reach",
    tagline: "Pastel lagoons with tall thermals — surf the warm updrafts",
    emoji: "🐚",
    amp: 1.02,
    wave: 0.96,
    top: 0xffc9d8,
    ridge: 0xf09ab8,
    mid: 0x2fb4a8,
    deep: 0x14707a,
    sand: 0xffe8d0,
    farA: 0x62c8c0,
    farB: 0x4a9ec8,
    farC: 0x4a68a0,
    skyTop: 0x3ab8e8,
    skyHorizon: 0xffd8e8,
    skyMix: 0.4,
    cloudTint: 0xfff0f6,
    cloudDensity: 0.9,
    snowLine: 0,
    deco: "palm",
    decoDensity: 1.1,
    hazard: "none",
    thermals: 5,
    fogTint: 0xcfeef0,
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
    cloudDensity: 0.6,
    snowLine: 0,
    deco: "cactus",
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
    cloudDensity: 0.75,
    snowLine: 0,
    deco: "pine",
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
    cloudDensity: 0.85,
    snowLine: 26,
    deco: "crystal",
    decoDensity: 0.95,
    hazard: "gust",
    thermals: 4,
    fogTint: 0xbfe8ff,
    glow: true,
    musicMode: "crystal",
  },
  {
    id: "volcano",
    name: "Cinder Forge",
    tagline: "Black glass slopes and violent thermals — dodge the ash",
    emoji: "🌋",
    amp: 1.5,
    wave: 0.88,
    top: 0x5a4448,
    ridge: 0x3c2a30,
    mid: 0x281a20,
    deep: 0x140c10,
    sand: 0x6a5248,
    farA: 0x4a3038,
    farB: 0x38222c,
    farC: 0x241418,
    skyTop: 0x2a1418,
    skyHorizon: 0xff7a3a,
    skyMix: 0.7,
    cloudTint: 0x9a6858,
    cloudDensity: 0.7,
    snowLine: 0,
    deco: "spire",
    decoDensity: 0.8,
    hazard: "storm",
    thermals: 6,
    fogTint: 0x54303a,
    glow: true,
    musicMode: "night",
  },
  {
    id: "canyon",
    name: "Skyreach Canyon",
    tagline: "Vast red walls with monster ramps — the biggest launches live here",
    emoji: "🏜",
    amp: 1.65,
    wave: 1.3,
    top: 0xe08a5a,
    ridge: 0xb85c3c,
    mid: 0x8a3c2c,
    deep: 0x501f18,
    sand: 0xf0c090,
    farA: 0xc07850,
    farB: 0x94503c,
    farC: 0x63302a,
    skyTop: 0x3a78c8,
    skyHorizon: 0xffd8a8,
    skyMix: 0.35,
    cloudTint: 0xffeedd,
    cloudDensity: 0.55,
    snowLine: 0,
    deco: "cactus",
    decoDensity: 0.7,
    hazard: "gust",
    thermals: 5,
    fogTint: 0xe8c8a8,
    glow: false,
    musicMode: "wide",
  },
];

function shade(hex: number, amt: number): number {
  const r = Math.max(0, Math.min(255, ((hex >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((hex >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (hex & 255) + amt));
  return (r << 16) | (g << 8) | b;
}

const WILD_SUFFIX = ["Wilds", "Reaches", "Expanse", "Frontier", "Verge", "Beyond"];
const _wildCache = new Map<number, BiomeDef>();

export function biomeForIsland(island: number): BiomeDef {
  const i = Math.max(0, Math.floor(island));
  if (i < BIOMES.length) return BIOMES[i]!;
  // UNLIMITED LEVELS: deterministic remix past the hand-tuned six.
  // Same seed => same island forever, new hue shift + amp/wave drift per lap.
  const cached = _wildCache.get(i);
  if (cached) return cached;
  const base = BIOMES[i % BIOMES.length]!;
  const lap = Math.floor(i / BIOMES.length); // 1,2,3...
  // deterministic pseudo-random from island index
  let h = (i * 2654435761) >>> 0;
  const rnd = (): number => {
    h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0;
    return (h >>> 0) / 4294967296;
  };
  const shift = Math.floor((rnd() - 0.5) * 36) + lap * 12;
  const amp = base.amp * (1 + lap * 0.07 + rnd() * 0.08);
  const wave = base.wave * (1 + (rnd() - 0.5) * 0.14);
  const suffix = WILD_SUFFIX[i % WILD_SUFFIX.length]!;
  const decoPool: DecoKind[] = ["tree", "palm", "pine", "spire", "crystal", "cactus"];
  const gen: BiomeDef = {
    ...base,
    id: `wild-${i}`,
    name: `${base.name} ${suffix} ${lap + 1}`,
    tagline: `Uncharted lap ${lap + 1} — remixed ${base.name.toLowerCase()}`,
    emoji: base.emoji,
    amp, wave,
    top: shade(base.top, shift), ridge: shade(base.ridge, shift),
    mid: shade(base.mid, shift), deep: shade(base.deep, shift),
    sand: shade(base.sand, Math.floor(shift / 2)),
    farA: shade(base.farA, shift), farB: shade(base.farB, shift), farC: shade(base.farC, shift),
    skyTop: shade(base.skyTop, shift), skyHorizon: shade(base.skyHorizon, Math.floor(shift / 2)),
    cloudTint: shade(base.cloudTint, Math.floor(shift / 3)),
    fogTint: shade(base.fogTint, Math.floor(shift / 2)),
    snowLine: base.snowLine > 0 ? base.snowLine + lap * 2 : rnd() < 0.25 ? 24 + lap * 2 : 0,
    deco: decoPool[Math.floor(rnd() * decoPool.length)]!,
    decoDensity: base.decoDensity * (0.9 + rnd() * 0.5),
    hazard: lap >= 2 && rnd() < 0.3 ? (rnd() < 0.5 ? "gust" : "storm") : base.hazard,
    thermals: Math.max(1, Math.min(7, base.thermals + Math.floor((rnd() - 0.4) * 2))),
  };
  _wildCache.set(i, gen);
  if (_wildCache.size > 64) {
    const first = _wildCache.keys().next().value;
    if (first !== undefined) _wildCache.delete(first);
  }
  return gen;
}

/** Difficulty tier: every full lap of the world cycle raises the stakes. */
export function tierForIsland(island: number): number {
  return Math.floor(Math.max(0, island) / BIOMES.length);
}

/**
 * Ocean gap widens forever — every island asks for a little more air. Growth
 * is deliberately gentle so it stays fair for many islands while still
 * escalating without end (the "harder and harder" curve).
 */
export function gapEndFor(island: number): number {
  return GAP_START + 148 + island * 7;
}

/** Launch ramp peak grows to match the ever-wider gap it has to clear. */
export function rampPeakFor(island: number): number {
  return 28 + island * 2;
}
