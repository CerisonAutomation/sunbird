export type SkinDef = {
  id: string;
  name: string;
  perk: string;
  price: number;
  goldOnly?: boolean;
  vipOnly?: boolean;
  body: number;
  wing: number;
  belly: number;
  beak: number;
  speedMult: number;
  feverBonus: number;
  daylightBonus: number;
  magnetAlways: boolean;
};

export const SKINS: SkinDef[] = [
  {
    id: "sunbird",
    name: "Sunbird",
    perk: "Balanced classic",
    price: 0,
    body: 0xff7a45,
    wing: 0xff9a62,
    belly: 0xffe6c4,
    beak: 0xffc447,
    speedMult: 1,
    feverBonus: 0,
    daylightBonus: 0,
    magnetAlways: false,
  },
  {
    id: "bluejay",
    name: "Bluejay",
    perk: "+6% top speed",
    price: 200,
    body: 0x3d8bf2,
    wing: 0x7fb8ff,
    belly: 0xeaf4ff,
    beak: 0x2b2f4a,
    speedMult: 1.06,
    feverBonus: 0,
    daylightBonus: 0,
    magnetAlways: false,
  },
  {
    id: "ember",
    name: "Ember",
    perk: "Fever lasts +4 s",
    price: 450,
    body: 0xe0392a,
    wing: 0xff9a1f,
    belly: 0xffe2a8,
    beak: 0xffd166,
    speedMult: 1,
    feverBonus: 4,
    daylightBonus: 0,
    magnetAlways: false,
  },
  {
    id: "owl",
    name: "Dusk Owl",
    perk: "+10 s of daylight",
    price: 700,
    body: 0x5d4f86,
    wing: 0x8f7fc0,
    belly: 0xf1eaff,
    beak: 0xffb347,
    speedMult: 1,
    feverBonus: 0,
    daylightBonus: 10,
    magnetAlways: false,
  },
  {
    id: "phoenix",
    name: "Phoenix",
    perk: "Always-on coin magnet · ember trail",
    price: 0,
    goldOnly: true,
    body: 0xffb020,
    wing: 0xff4d2a,
    belly: 0xfff3c2,
    beak: 0xffe066,
    speedMult: 1.03,
    feverBonus: 2,
    daylightBonus: 0,
    magnetAlways: true,
  },
  {
    id: "aurora",
    name: "Aurora",
    perk: "VIP exclusive · rainbow fever trail",
    price: 0,
    vipOnly: true,
    body: 0x7fd8c8,
    wing: 0xa78bff,
    belly: 0xeafff6,
    beak: 0xffd166,
    speedMult: 1.02,
    feverBonus: 3,
    daylightBonus: 4,
    magnetAlways: false,
  },
  {
    id: "jet",
    name: "Jet",
    perk: "+8% top speed",
    price: 350,
    body: 0x2d2d2d,
    wing: 0xff4444,
    belly: 0xffcccc,
    beak: 0xff6666,
    speedMult: 1.08,
    feverBonus: 0,
    daylightBonus: 0,
    magnetAlways: false,
  },
  {
    id: "cloudwalker",
    name: "Cloudwalker",
    perk: "+6 s daylight",
    price: 500,
    body: 0xe8f4fd,
    wing: 0xb8d8f8,
    belly: 0xffffff,
    beak: 0xffd166,
    speedMult: 1,
    feverBonus: 0,
    daylightBonus: 6,
    magnetAlways: false,
  },
  {
    id: "stormchaser",
    name: "Stormchaser",
    perk: "+3 s fever duration",
    price: 600,
    body: 0x4a6fa5,
    wing: 0x8ab4d8,
    belly: 0xd4e8f5,
    beak: 0xffa040,
    speedMult: 1.02,
    feverBonus: 3,
    daylightBonus: 0,
    magnetAlways: false,
  },
  {
    id: "snowowl",
    name: "Snow Owl",
    perk: "+8 s daylight",
    price: 550,
    body: 0xf0f0f8,
    wing: 0xc8d0e8,
    belly: 0xffffff,
    beak: 0xffb020,
    speedMult: 1,
    feverBonus: 0,
    daylightBonus: 8,
    magnetAlways: false,
  },
  {
    id: "ruby",
    name: "Ruby",
    perk: "+5% speed · +2 s fever",
    price: 400,
    body: 0xcc2244,
    wing: 0xff5577,
    belly: 0xffddee,
    beak: 0xffaa44,
    speedMult: 1.05,
    feverBonus: 2,
    daylightBonus: 0,
    magnetAlways: false,
  },
  {
    id: "golden",
    name: "Golden Eagle",
    perk: "+4% speed · +4 s daylight",
    price: 800,
    body: 0xdaa520,
    wing: 0xffd700,
    belly: 0xfff8dc,
    beak: 0xffa500,
    speedMult: 1.04,
    feverBonus: 0,
    daylightBonus: 4,
    magnetAlways: false,
  },
  // Nature Collection
  { id: "falcon", name: "Peregrine", perk: "+7% top speed", price: 450, body: 0x3a5a3a, wing: 0x6a8a6a, belly: 0xd4e8d4, beak: 0xffa040, speedMult: 1.07, feverBonus: 0, daylightBonus: 0, magnetAlways: false },
  { id: "heron", name: "Grey Heron", perk: "+4% speed · +3 s daylight", price: 500, body: 0x7a8a9a, wing: 0xa0b0c0, belly: 0xf0f4f8, beak: 0xffb020, speedMult: 1.04, feverBonus: 0, daylightBonus: 3, magnetAlways: false },
  { id: "cardinal", name: "Cardinal", perk: "Fever lasts +3 s", price: 400, body: 0xcc3333, wing: 0xff6666, belly: 0xffcccc, beak: 0xffaa44, speedMult: 1, feverBonus: 3, daylightBonus: 0, magnetAlways: false },
  { id: "kingfisher", name: "Kingfisher", perk: "Fever lasts +2 s · +2% speed", price: 550, body: 0x0077be, wing: 0x00aaff, belly: 0xffeecc, beak: 0xff6600, speedMult: 1.02, feverBonus: 2, daylightBonus: 0, magnetAlways: false },
  { id: "magpie", name: "Magpie", perk: "+6 s daylight", price: 350, body: 0x1a1a2e, wing: 0x4a4a6a, belly: 0xffffff, beak: 0xffd700, speedMult: 1, feverBonus: 0, daylightBonus: 6, magnetAlways: false },
  { id: "lorikeet", name: "Lorikeet", perk: "Fever +3 s · +3 s daylight", price: 650, body: 0x00aa44, wing: 0xff6600, belly: 0xffffcc, beak: 0xff4400, speedMult: 1, feverBonus: 3, daylightBonus: 3, magnetAlways: false },
  // Elements Collection
  { id: "ember_wren", name: "Ember Wren", perk: "+3% speed · ember trail", price: 400, body: 0xcc4400, wing: 0xff8844, belly: 0xffddaa, beak: 0xffcc00, speedMult: 1.03, feverBonus: 0, daylightBonus: 0, magnetAlways: false },
  { id: "snow_owl", name: "Snowy Owl", perk: "+8 s daylight", price: 550, body: 0xf0f0f8, wing: 0xc8d0e8, belly: 0xffffff, beak: 0xffb020, speedMult: 1, feverBonus: 0, daylightBonus: 8, magnetAlways: false },
  { id: "storm_rider", name: "Storm Rider", perk: "Weather immunity", price: 700, body: 0x2a3a5a, wing: 0x5a7a9a, belly: 0xd0e0f0, beak: 0xffa040, speedMult: 1.01, feverBonus: 1, daylightBonus: 0, magnetAlways: false },
  { id: "crystal", name: "Crystal Wing", perk: "+5% speed · +2 s daylight", price: 600, body: 0x88ccff, wing: 0xaaeeff, belly: 0xffffff, beak: 0xffd700, speedMult: 1.05, feverBonus: 0, daylightBonus: 2, magnetAlways: false },
  // Cosmic Collection
  { id: "nebula", name: "Nebula", perk: "+3% speed · +3 s fever", price: 750, body: 0x6a3a8a, wing: 0xaa66cc, belly: 0xeeddff, beak: 0xffaa44, speedMult: 1.03, feverBonus: 3, daylightBonus: 0, magnetAlways: false },
  { id: "comet", name: "Comet", perk: "+6% speed", price: 500, body: 0x2244aa, wing: 0x66aaff, belly: 0xccddff, beak: 0xffcc00, speedMult: 1.06, feverBonus: 0, daylightBonus: 0, magnetAlways: false },
  { id: "supernova", name: "Supernova", perk: "+4% speed · +4 s fever", price: 800, body: 0xff4400, wing: 0xff8800, belly: 0xffeecc, beak: 0xffdd00, speedMult: 1.04, feverBonus: 4, daylightBonus: 0, magnetAlways: false },
  { id: "void", name: "Void Walker", perk: "+5 s daylight · stealth", price: 650, body: 0x0a0a1a, wing: 0x2a2a4a, belly: 0x4a4a6a, beak: 0x8888aa, speedMult: 1, feverBonus: 0, daylightBonus: 5, magnetAlways: false },
  // Seasonal Collection
  { id: "spring", name: "Cherry Blossom", perk: "+3 s daylight · +2 s fever", price: 450, body: 0xffaacc, wing: 0xffccee, belly: 0xffffff, beak: 0xffaa44, speedMult: 1, feverBonus: 2, daylightBonus: 3, magnetAlways: false },
  { id: "summer", name: "Sunset", perk: "+5% speed · +3 s daylight", price: 500, body: 0xff6644, wing: 0xffaa66, belly: 0xffeedd, beak: 0xffcc00, speedMult: 1.05, feverBonus: 0, daylightBonus: 3, magnetAlways: false },
  { id: "autumn", name: "Maple", perk: "+4 s daylight", price: 400, body: 0xcc6600, wing: 0xffaa44, belly: 0xffeedd, beak: 0xff8800, speedMult: 1, feverBonus: 0, daylightBonus: 4, magnetAlways: false },
  { id: "winter", name: "Frost", perk: "+6 s daylight · weather immunity", price: 700, body: 0xaaccff, wing: 0xccddff, belly: 0xffffff, beak: 0xffdd00, speedMult: 1, feverBonus: 1, daylightBonus: 6, magnetAlways: false },
  // Tournament Rewards
  { id: "champion", name: "Champion", perk: "+5% speed · +5 s fever", price: 0, body: 0xffd700, wing: 0xffaa00, belly: 0xfff8dc, beak: 0xff6600, speedMult: 1.05, feverBonus: 5, daylightBonus: 0, magnetAlways: false, goldOnly: true },
  { id: "legendary", name: "Legendary", perk: "+8% speed · +4 s daylight", price: 0, body: 0x9933ff, wing: 0xbb66ff, belly: 0xeeddff, beak: 0xffaa44, speedMult: 1.08, feverBonus: 0, daylightBonus: 4, magnetAlways: false, goldOnly: true },
  { id: "mythic", name: "Mythic", perk: "All stats +5%", price: 0, body: 0xff3366, wing: 0xff6699, belly: 0xffeedd, beak: 0xffcc00, speedMult: 1.05, feverBonus: 3, daylightBonus: 3, magnetAlways: false, vipOnly: true },
  // Achievement Unlocks
  { id: "ghost", name: "Ghost", perk: "+4 s daylight · ghost trail", price: 0, body: 0x888899, wing: 0xaaaacc, belly: 0xddeeff, beak: 0xccccdd, speedMult: 1, feverBonus: 0, daylightBonus: 4, magnetAlways: false },
  { id: "shadow", name: "Shadow", perk: "+3% speed · stealth", price: 0, body: 0x222233, wing: 0x444455, belly: 0x666677, beak: 0x888899, speedMult: 1.03, feverBonus: 0, daylightBonus: 0, magnetAlways: false },
  { id: "rainbow", name: "Rainbow", perk: "All stats +3%", price: 0, body: 0xff4444, wing: 0x44ff44, belly: 0x4444ff, beak: 0xffff44, speedMult: 1.03, feverBonus: 2, daylightBonus: 2, magnetAlways: false },
  { id: "golden_eagle", name: "Golden Eagle", perk: "+4% speed · +4 s daylight", price: 800, body: 0xdaa520, wing: 0xffd700, belly: 0xfff8dc, beak: 0xffa500, speedMult: 1.04, feverBonus: 0, daylightBonus: 4, magnetAlways: false },
  { id: "phoenix_ember", name: "Phoenix Ember", perk: "+6% speed · ember trail", price: 900, body: 0xff2200, wing: 0xff6600, belly: 0xffccaa, beak: 0xffaa00, speedMult: 1.06, feverBonus: 0, daylightBonus: 0, magnetAlways: false },
  { id: "ice_dragon", name: "Ice Dragon", perk: "+7 s daylight · weather immunity", price: 850, body: 0x66aaff, wing: 0x88ccff, belly: 0xeeffff, beak: 0xffdd00, speedMult: 1, feverBonus: 1, daylightBonus: 7, magnetAlways: false },
  { id: "fire_dragon", name: "Fire Dragon", perk: "+5% speed · +3 s fever", price: 850, body: 0xff4400, wing: 0xff8800, belly: 0xffeecc, beak: 0xffcc00, speedMult: 1.05, feverBonus: 3, daylightBonus: 0, magnetAlways: false },
  { id: "thunder", name: "Thunder", perk: "+4% speed · weather immunity", price: 750, body: 0x334466, wing: 0x6688aa, belly: 0xccddee, beak: 0xffaa44, speedMult: 1.04, feverBonus: 1, daylightBonus: 0, magnetAlways: false },
  { id: "wind", name: "Zephyr", perk: "+6% speed · +2 s daylight", price: 650, body: 0x88bbdd, wing: 0xaaddff, belly: 0xeeffff, beak: 0xffcc00, speedMult: 1.06, feverBonus: 0, daylightBonus: 2, magnetAlways: false },
  { id: "earth", name: "Terra", perk: "+5 s daylight · magnet", price: 700, body: 0x668844, wing: 0x88aa66, belly: 0xccddaa, beak: 0xffaa44, speedMult: 1, feverBonus: 0, daylightBonus: 5, magnetAlways: false },
  { id: "moon", name: "Moonbird", perk: "+4 s daylight · stealth", price: 600, body: 0xccccee, wing: 0xeeeeff, belly: 0xffffff, beak: 0xffdd00, speedMult: 1, feverBonus: 0, daylightBonus: 4, magnetAlways: false },
  { id: "sun", name: "Solar", perk: "+3% speed · +3 s fever", price: 550, body: 0xffcc00, wing: 0xffee66, belly: 0xffffcc, beak: 0xff8800, speedMult: 1.03, feverBonus: 3, daylightBonus: 0, magnetAlways: false },
  { id: "star", name: "Starlight", perk: "+5 s daylight · +2 s fever", price: 650, body: 0xffeeff, wing: 0xffffff, belly: 0xffffff, beak: 0xffdd00, speedMult: 1, feverBonus: 2, daylightBonus: 5, magnetAlways: false },
  { id: "cosmos", name: "Cosmos", perk: "+4% speed · +4 s daylight", price: 700, body: 0x2233aa, wing: 0x4466cc, belly: 0xaabbdd, beak: 0xffaa44, speedMult: 1.04, feverBonus: 0, daylightBonus: 4, magnetAlways: false },
  { id: "nova", name: "Nova", perk: "+5% speed · +2 s fever", price: 600, body: 0xff6644, wing: 0xffaa66, belly: 0xffeedd, beak: 0xffcc00, speedMult: 1.05, feverBonus: 2, daylightBonus: 0, magnetAlways: false },
  { id: "quasar", name: "Quasar", perk: "+3% speed · +5 s daylight", price: 750, body: 0x4466cc, wing: 0x6688ee, belly: 0xaaccff, beak: 0xffaa44, speedMult: 1.03, feverBonus: 0, daylightBonus: 5, magnetAlways: false },
  { id: "pulsar", name: "Pulsar", perk: "+4% speed · +3 s fever", price: 700, body: 0x6644aa, wing: 0x8866cc, belly: 0xccbbff, beak: 0xffaa44, speedMult: 1.04, feverBonus: 3, daylightBonus: 0, magnetAlways: false },
  { id: "aurora_borealis", name: "Aurora Borealis", perk: "+3 s daylight · +3 s fever", price: 800, body: 0x44aa88, wing: 0x66ccaa, belly: 0xaaffcc, beak: 0xffaa44, speedMult: 1, feverBonus: 3, daylightBonus: 3, magnetAlways: false },
  { id: "solar_flare", name: "Solar Flare", perk: "+6% speed · +2 s fever", price: 850, body: 0xff4400, wing: 0xff8800, belly: 0xffccaa, beak: 0xffaa00, speedMult: 1.06, feverBonus: 2, daylightBonus: 0, magnetAlways: false },
  { id: "black_hole", name: "Black Hole", perk: "+5 s daylight · magnet", price: 900, body: 0x111122, wing: 0x222244, belly: 0x333355, beak: 0x6666aa, speedMult: 1, feverBonus: 0, daylightBonus: 5, magnetAlways: false },
  { id: "dark_matter", name: "Dark Matter", perk: "+4% speed · +4 s fever", price: 850, body: 0x1a1a2e, wing: 0x333355, belly: 0x4a4a6a, beak: 0x8888aa, speedMult: 1.04, feverBonus: 4, daylightBonus: 0, magnetAlways: false },
];

export type TrailDef = {
  id: string;
  name: string;
  color: number;
  glow: number;
  particles: "spark" | "stream" | "rainbow" | "ember" | "ice" | "none";
  unlock: "free" | "coins" | "gold" | "achievement" | "tournament";
  price: number;
};

export const TRAILS: TrailDef[] = [
  { id: "default", name: "Default", color: 0xffffff, glow: 0.5, particles: "spark", unlock: "free", price: 0 },
  { id: "flame", name: "Flame Trail", color: 0xff6600, glow: 0.8, particles: "ember", unlock: "coins", price: 200 },
  { id: "ice", name: "Frost Trail", color: 0x88ccff, glow: 0.7, particles: "ice", unlock: "coins", price: 200 },
  { id: "electric", name: "Lightning Trail", color: 0xffff44, glow: 0.9, particles: "spark", unlock: "coins", price: 250 },
  { id: "shadow", name: "Shadow Trail", color: 0x444466, glow: 0.3, particles: "stream", unlock: "coins", price: 200 },
  { id: "rainbow", name: "Rainbow Trail", color: 0xff4444, glow: 0.8, particles: "rainbow", unlock: "gold", price: 0 },
  { id: "gold", name: "Golden Trail", color: 0xffd700, glow: 1.0, particles: "spark", unlock: "gold", price: 0 },
  { id: "aurora", name: "Aurora Trail", color: 0x44ff88, glow: 0.9, particles: "rainbow", unlock: "achievement", price: 0 },
  { id: "comet", name: "Comet Trail", color: 0x66aaff, glow: 0.8, particles: "stream", unlock: "achievement", price: 0 },
  { id: "ember", name: "Ember Trail", color: 0xff4400, glow: 0.7, particles: "ember", unlock: "achievement", price: 0 },
  { id: "nebula", name: "Nebula Trail", color: 0xaa66cc, glow: 0.8, particles: "rainbow", unlock: "achievement", price: 0 },
  { id: "crystal", name: "Crystal Trail", color: 0x88eeff, glow: 0.9, particles: "ice", unlock: "achievement", price: 0 },
  { id: "thunder", name: "Thunder Trail", color: 0xffff88, glow: 0.8, particles: "spark", unlock: "tournament", price: 0 },
  { id: "void", name: "Void Trail", color: 0x6644aa, glow: 0.6, particles: "stream", unlock: "tournament", price: 0 },
  { id: "supernova", name: "Supernova Trail", color: 0xff8800, glow: 1.0, particles: "ember", unlock: "tournament", price: 0 },
  { id: "cosmic", name: "Cosmic Trail", color: 0x4466cc, glow: 0.9, particles: "rainbow", unlock: "tournament", price: 0 },
  { id: "solar", name: "Solar Trail", color: 0xffcc00, glow: 0.8, particles: "spark", unlock: "achievement", price: 0 },
  { id: "lunar", name: "Lunar Trail", color: 0xccccee, glow: 0.7, particles: "ice", unlock: "achievement", price: 0 },
  { id: "nova", name: "Nova Trail", color: 0xff6644, glow: 0.9, particles: "ember", unlock: "achievement", price: 0 },
  { id: "quasar", name: "Quasar Trail", color: 0x4466cc, glow: 0.8, particles: "spark", unlock: "achievement", price: 0 },
  { id: "pulsar", name: "Pulsar Trail", color: 0x6644aa, glow: 0.7, particles: "stream", unlock: "achievement", price: 0 },
  { id: "aurora_borealis", name: "Aurora Borealis Trail", color: 0x44aa88, glow: 0.9, particles: "rainbow", unlock: "achievement", price: 0 },
  { id: "solar_flare", name: "Solar Flare Trail", color: 0xff4400, glow: 1.0, particles: "ember", unlock: "achievement", price: 0 },
  { id: "black_hole", name: "Black Hole Trail", color: 0x222244, glow: 0.5, particles: "stream", unlock: "achievement", price: 0 },
  { id: "dark_matter", name: "Dark Matter Trail", color: 0x333355, glow: 0.6, particles: "rainbow", unlock: "achievement", price: 0 },
];

export function skinById(id: string): SkinDef {
  return SKINS.find((s) => s.id === id) ?? SKINS[0]!;
}

export type BoostDef = {
  id: string;
  name: string;
  desc: string;
  price: number;
  icon: string;
};

export const BOOSTS: BoostDef[] = [
  { id: "shield", name: "Sea Shield", desc: "Bounce off the ocean once", price: 60, icon: "🛡" },
  { id: "magnet", name: "Coin Magnet", desc: "Take off with 15 s of magnet", price: 40, icon: "🧲" },
  { id: "sunflask", name: "Sun Flask", desc: "+12 s daylight at takeoff", price: 50, icon: "☀" },
  { id: "headstart", name: "Head Start", desc: "Launch from 300 m at full speed", price: 90, icon: "🚀" },
];

export const GOLD = {
  sku: "sunbird_gold" as const,
  price: "$2.99",
  name: "Sunbird Gold",
  features: [
    "Phoenix skin — permanent coin magnet & ember trail",
    "2× coins on every flight",
    "+10 s longer days",
    "No sponsored breaks, ever",
    "Free second wind on every run",
    "Fly yesterday's hills or wild random seeds",
    "Unlocks the Nest Pass premium reward track",
  ],
};

export const VIP = {
  sku: "sunbird_vip" as const,
  price: "$1.99/mo",
  name: "Sunbird VIP",
  features: [
    "Exclusive Aurora bird skin with a rainbow trail",
    "Daily login gift of 25 coins",
    "Priority queue on the daily quest refresh",
    "A little sparkle on your name in high-score tables",
  ],
};

export type Promo = { type: "gold" } | { type: "vip" } | { type: "coins"; amount: number };

export const PROMO_CODES: Record<string, Promo> = {
  ZENITH: { type: "gold" },
  SUNBIRD: { type: "gold" },
  NEST250: { type: "coins", amount: 250 },
  FEATHER: { type: "coins", amount: 100 },
  AURORA: { type: "vip" },
};

export type SkinView = {
  def: SkinDef;
  owned: boolean;
  equipped: boolean;
  locked: boolean;
  lockReason: "gold" | "vip" | null;
  affordable: boolean;
};

export type BoostView = {
  def: BoostDef;
  armed: boolean;
  affordable: boolean;
};
