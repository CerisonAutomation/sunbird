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
    perk: "+8% speed · featherweight",
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
    perk: "+6s daylight · cloud bonus",
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
    perk: "Weather immunity · +3s fever",
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
    perk: "+8s daylight · stealth",
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
    perk: "+5% speed · +2s fever",
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
    perk: "+4% speed · +4s daylight",
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
