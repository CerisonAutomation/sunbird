export type SkinRarity = "starter" | "common" | "rare" | "epic" | "legendary" | "mythic";
export type CollectionId = "starter" | "nature" | "elements" | "cosmic" | "seasonal" | "premium" | "tournament" | "achievement";

export type SkinDef = {
  id: string;
  name: string;
  perk: string;
  price: number;
  goldOnly?: boolean;
  vipOnly?: boolean;
  /** Earned, never bought: the label explains how (duels, gauntlets, pass, rank). */
  prizeOnly?: string;
  body: number;
  wing: number;
  belly: number;
  beak: number;
  speedMult: number;
  feverBonus: number;
  daylightBonus: number;
  magnetAlways: boolean;
  rarity?: SkinRarity;
  collection?: CollectionId;
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
    id: "robin",
    name: "Robin",
    perk: "+3% top speed",
    price: 150,
    body: 0xb2543a,
    wing: 0xd97b52,
    belly: 0xffd9b0,
    beak: 0xf2c14e,
    speedMult: 1.03,
    feverBonus: 0,
    daylightBonus: 0,
    magnetAlways: false,
  },
  {
    id: "canary",
    name: "Canary",
    perk: "+4 s of daylight",
    price: 180,
    body: 0xffd53d,
    wing: 0xffe57a,
    belly: 0xfff8d6,
    beak: 0xff9f3a,
    speedMult: 1,
    feverBonus: 0,
    daylightBonus: 4,
    magnetAlways: false,
  },
  {
    id: "swift",
    name: "Storm Swift",
    perk: "+5% top speed",
    price: 260,
    body: 0x4a5568,
    wing: 0x718096,
    belly: 0xe2e8f0,
    beak: 0x2d3748,
    speedMult: 1.05,
    feverBonus: 0,
    daylightBonus: 0,
    magnetAlways: false,
  },
  {
    id: "kingfisher",
    name: "Kingfisher",
    perk: "Fever lasts +2 s · +2% speed",
    price: 320,
    body: 0x00a3c4,
    wing: 0x0bc5ea,
    belly: 0xfefcbf,
    beak: 0xdd6b20,
    speedMult: 1.02,
    feverBonus: 2,
    daylightBonus: 0,
    magnetAlways: false,
  },
  {
    id: "cardinal",
    name: "Cardinal",
    perk: "Fever lasts +3 s",
    price: 380,
    body: 0xc53030,
    wing: 0xe53e3e,
    belly: 0xfed7d7,
    beak: 0xf6ad55,
    speedMult: 1,
    feverBonus: 3,
    daylightBonus: 0,
    magnetAlways: false,
  },
  {
    id: "magpie",
    name: "Magpie",
    perk: "+6 s of daylight",
    price: 420,
    body: 0x1a202c,
    wing: 0x4fd1c5,
    belly: 0xf7fafc,
    beak: 0x2d3748,
    speedMult: 1,
    feverBonus: 0,
    daylightBonus: 6,
    magnetAlways: false,
  },
  {
    id: "heron",
    name: "Grey Heron",
    perk: "+4% speed · +3 s daylight",
    price: 520,
    body: 0x8ba2b5,
    wing: 0xb8c9d9,
    belly: 0xf0f5fa,
    beak: 0xf2c14e,
    speedMult: 1.04,
    feverBonus: 0,
    daylightBonus: 3,
    magnetAlways: false,
  },
  {
    id: "lorikeet",
    name: "Lorikeet",
    perk: "Fever +3 s · +3 s daylight",
    price: 560,
    body: 0x2f855a,
    wing: 0xd53f8c,
    belly: 0xfaf089,
    beak: 0xed8936,
    speedMult: 1,
    feverBonus: 3,
    daylightBonus: 3,
    magnetAlways: false,
  },
  {
    id: "falcon",
    name: "Peregrine",
    perk: "+7% top speed",
    price: 640,
    body: 0x2c5282,
    wing: 0x2b6cb0,
    belly: 0xebf8ff,
    beak: 0x1a365d,
    speedMult: 1.07,
    feverBonus: 0,
    daylightBonus: 0,
    magnetAlways: false,
  },
  {
    id: "ibis",
    name: "Scarlet Ibis",
    perk: "+8 s of daylight",
    price: 720,
    body: 0xe53e3e,
    wing: 0xfc8181,
    belly: 0xfff5f5,
    beak: 0x742a2a,
    speedMult: 1,
    feverBonus: 0,
    daylightBonus: 8,
    magnetAlways: false,
  },
  {
    id: "quetzal",
    name: "Quetzal",
    perk: "Fever +4 s · +2% speed",
    price: 780,
    body: 0x276749,
    wing: 0x38b2ac,
    belly: 0xc53030,
    beak: 0xf6e05e,
    speedMult: 1.02,
    feverBonus: 4,
    daylightBonus: 0,
    magnetAlways: false,
  },
  {
    id: "harpy",
    name: "Harpy Eagle",
    perk: "+6% speed · +4 s daylight",
    price: 850,
    body: 0x4a5568,
    wing: 0x1a202c,
    belly: 0xedf2f7,
    beak: 0x718096,
    speedMult: 1.06,
    feverBonus: 0,
    daylightBonus: 4,
    magnetAlways: false,
  },
  {
    id: "raven",
    name: "Midnight Raven",
    perk: "Fever +5 s",
    price: 900,
    body: 0x171923,
    wing: 0x2d3748,
    belly: 0x4a5568,
    beak: 0x805ad5,
    speedMult: 1,
    feverBonus: 5,
    daylightBonus: 0,
    magnetAlways: false,
  },
  {
    id: "condor",
    name: "Sun Condor",
    perk: "+5% speed · fever +3 s · +3 s daylight",
    price: 950,
    body: 0x975a16,
    wing: 0xd69e2e,
    belly: 0xfffff0,
    beak: 0xe53e3e,
    speedMult: 1.05,
    feverBonus: 3,
    daylightBonus: 3,
    magnetAlways: false,
  },
  {
    id: "hummingbird",
    name: "Jewel Hummingbird",
    perk: "Duel prize · +4% speed · fever +2 s",
    price: 0,
    prizeOnly: "Win 10 ranked duels",
    body: 0x0bc5ea,
    wing: 0xd53f8c,
    belly: 0xc6f6d5,
    beak: 0x2d3748,
    speedMult: 1.04,
    feverBonus: 2,
    daylightBonus: 0,
    magnetAlways: false,
  },
  {
    id: "stormcrow",
    name: "Stormcrow",
    perk: "Gauntlet prize · +5 s daylight · fever +2 s",
    price: 0,
    prizeOnly: "Clear 5 weekly gauntlets",
    body: 0x44337a,
    wing: 0x6b46c1,
    belly: 0xe9d8fd,
    beak: 0xfaf089,
    speedMult: 1,
    feverBonus: 2,
    daylightBonus: 5,
    magnetAlways: false,
  },
  {
    id: "paradise",
    name: "Bird of Paradise",
    perk: "Season prize · +3% speed · +5 s daylight",
    price: 0,
    prizeOnly: "Reach Nest Pass tier 30",
    body: 0xd69e2e,
    wing: 0x00a3c4,
    belly: 0x1a202c,
    beak: 0xe53e3e,
    speedMult: 1.03,
    feverBonus: 0,
    daylightBonus: 5,
    magnetAlways: false,
  },
  {
    id: "solstice",
    name: "Solstice",
    perk: "Legend prize · +5% speed · fever +4 s",
    price: 0,
    prizeOnly: "Reach the Sunbird Legend division",
    body: 0xff6b1a,
    wing: 0xffd53d,
    belly: 0xfffaf0,
    beak: 0xc53030,
    speedMult: 1.05,
    feverBonus: 4,
    daylightBonus: 0,
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

  // --- Expanded catalogue (Elements · Cosmic · Seasonal · Tournament · Achievement collections) ---
  { id: "ember_wren", name: "Ember Wren", perk: "+3% speed · ember trail", price: 400, body: 0xcc4400, wing: 0xff8844, belly: 0xffddaa, beak: 0xffcc00, speedMult: 1.03, feverBonus: 0, daylightBonus: 0, magnetAlways: false, rarity: "common", collection: "elements" },
  { id: "snow_owl", name: "Snowy Owl", perk: "+8 s daylight", price: 550, body: 0xf0f0f8, wing: 0xc8d0e8, belly: 0xffffff, beak: 0xffb020, speedMult: 1, feverBonus: 0, daylightBonus: 8, magnetAlways: false, rarity: "rare", collection: "elements" },
  { id: "storm_rider", name: "Storm Rider", perk: "Weather immunity", price: 700, body: 0x2a3a5a, wing: 0x5a7a9a, belly: 0xd0e0f0, beak: 0xffa040, speedMult: 1.01, feverBonus: 1, daylightBonus: 0, magnetAlways: false, rarity: "rare", collection: "elements" },
  { id: "crystal", name: "Crystal Wing", perk: "+5% speed · +2 s daylight", price: 600, body: 0x88ccff, wing: 0xaaeeff, belly: 0xffffff, beak: 0xffd700, speedMult: 1.05, feverBonus: 0, daylightBonus: 2, magnetAlways: false, rarity: "rare", collection: "elements" },
  { id: "nebula", name: "Nebula", perk: "+3% speed · +3 s fever", price: 750, body: 0x6a3a8a, wing: 0xaa66cc, belly: 0xeeddff, beak: 0xffaa44, speedMult: 1.03, feverBonus: 3, daylightBonus: 0, magnetAlways: false, rarity: "epic", collection: "cosmic" },
  { id: "comet", name: "Comet", perk: "+6% speed", price: 500, body: 0x2244aa, wing: 0x66aaff, belly: 0xccddff, beak: 0xffcc00, speedMult: 1.06, feverBonus: 0, daylightBonus: 0, magnetAlways: false, rarity: "common", collection: "cosmic" },
  { id: "supernova", name: "Supernova", perk: "+4% speed · +4 s fever", price: 800, body: 0xff4400, wing: 0xff8800, belly: 0xffeecc, beak: 0xffdd00, speedMult: 1.04, feverBonus: 4, daylightBonus: 0, magnetAlways: false, rarity: "legendary", collection: "cosmic" },
  { id: "void", name: "Void Walker", perk: "+5 s daylight · stealth", price: 650, body: 0x0a0a1a, wing: 0x2a2a4a, belly: 0x4a4a6a, beak: 0x8888aa, speedMult: 1, feverBonus: 0, daylightBonus: 5, magnetAlways: false, rarity: "rare", collection: "cosmic" },
  { id: "spring", name: "Cherry Blossom", perk: "+3 s daylight · +2 s fever", price: 450, body: 0xffaacc, wing: 0xffccee, belly: 0xffffff, beak: 0xffaa44, speedMult: 1, feverBonus: 2, daylightBonus: 3, magnetAlways: false, rarity: "common", collection: "seasonal" },
  { id: "summer", name: "Sunset", perk: "+5% speed · +3 s daylight", price: 500, body: 0xff6644, wing: 0xffaa66, belly: 0xffeedd, beak: 0xffcc00, speedMult: 1.05, feverBonus: 0, daylightBonus: 3, magnetAlways: false, rarity: "common", collection: "seasonal" },
  { id: "autumn", name: "Maple", perk: "+4 s daylight", price: 400, body: 0xcc6600, wing: 0xffaa44, belly: 0xffeedd, beak: 0xff8800, speedMult: 1, feverBonus: 0, daylightBonus: 4, magnetAlways: false, rarity: "common", collection: "seasonal" },
  { id: "winter", name: "Frost", perk: "+6 s daylight · weather immunity", price: 700, body: 0xaaccff, wing: 0xccddff, belly: 0xffffff, beak: 0xffdd00, speedMult: 1, feverBonus: 1, daylightBonus: 6, magnetAlways: false, rarity: "rare", collection: "seasonal" },
  { id: "champion", name: "Champion", perk: "+5% speed · +5 s fever", price: 0, body: 0xffd700, wing: 0xffaa00, belly: 0xfff8dc, beak: 0xff6600, speedMult: 1.05, feverBonus: 5, daylightBonus: 0, magnetAlways: false, rarity: "legendary", collection: "tournament", prizeOnly: "Claim a gold cup trophy" },
  { id: "legendary", name: "Legendary", perk: "+8% speed · +4 s daylight", price: 0, body: 0x9933ff, wing: 0xbb66ff, belly: 0xeeddff, beak: 0xffaa44, speedMult: 1.08, feverBonus: 0, daylightBonus: 4, magnetAlways: false, rarity: "legendary", collection: "tournament", prizeOnly: "Claim a diamond cup trophy" },
  { id: "mythic", name: "Mythic", perk: "All stats +5%", price: 0, body: 0xff3366, wing: 0xff6699, belly: 0xffeedd, beak: 0xffcc00, speedMult: 1.05, feverBonus: 3, daylightBonus: 3, magnetAlways: false, rarity: "mythic", collection: "tournament", prizeOnly: "Win 10 duels in a row" },
  { id: "ghost", name: "Ghost", perk: "+4 s daylight · ghost trail", price: 0, body: 0x888899, wing: 0xaaaacc, belly: 0xddeeff, beak: 0xccccdd, speedMult: 1, feverBonus: 0, daylightBonus: 4, magnetAlways: false, rarity: "epic", collection: "achievement", prizeOnly: "Beat your ghost 10 times" },
  { id: "shadow", name: "Shadow", perk: "+3% speed · stealth", price: 0, body: 0x222233, wing: 0x444455, belly: 0x666677, beak: 0x888899, speedMult: 1.03, feverBonus: 0, daylightBonus: 0, magnetAlways: false, rarity: "epic", collection: "achievement", prizeOnly: "Bank 25 zeniths lifetime" },
  { id: "rainbow", name: "Rainbow", perk: "All stats +3%", price: 0, body: 0xff4444, wing: 0x44ff44, belly: 0x4444ff, beak: 0xffff44, speedMult: 1.03, feverBonus: 2, daylightBonus: 2, magnetAlways: false, rarity: "legendary", collection: "achievement", prizeOnly: "Own 15 other skins" },
  { id: "golden_eagle", name: "Golden Eagle", perk: "+4% speed · +4 s daylight", price: 800, body: 0xdaa520, wing: 0xffd700, belly: 0xfff8dc, beak: 0xffa500, speedMult: 1.04, feverBonus: 0, daylightBonus: 4, magnetAlways: false, rarity: "epic", collection: "cosmic" },
  { id: "phoenix_ember", name: "Phoenix Ember", perk: "+6% speed · ember trail", price: 900, body: 0xff2200, wing: 0xff6600, belly: 0xffccaa, beak: 0xffaa00, speedMult: 1.06, feverBonus: 0, daylightBonus: 0, magnetAlways: false, rarity: "epic", collection: "cosmic" },
  { id: "ice_dragon", name: "Ice Dragon", perk: "+7 s daylight · weather immunity", price: 850, body: 0x66aaff, wing: 0x88ccff, belly: 0xeeffff, beak: 0xffdd00, speedMult: 1, feverBonus: 1, daylightBonus: 7, magnetAlways: false, rarity: "epic", collection: "cosmic" },
  { id: "fire_dragon", name: "Fire Dragon", perk: "+5% speed · +3 s fever", price: 850, body: 0xff4400, wing: 0xff8800, belly: 0xffeecc, beak: 0xffcc00, speedMult: 1.05, feverBonus: 3, daylightBonus: 0, magnetAlways: false, rarity: "epic", collection: "cosmic" },
  { id: "thunder", name: "Thunder", perk: "+4% speed · weather immunity", price: 750, body: 0x334466, wing: 0x6688aa, belly: 0xccddee, beak: 0xffaa44, speedMult: 1.04, feverBonus: 1, daylightBonus: 0, magnetAlways: false, rarity: "epic", collection: "cosmic" },
  { id: "wind", name: "Zephyr", perk: "+6% speed · +2 s daylight", price: 650, body: 0x88bbdd, wing: 0xaaddff, belly: 0xeeffff, beak: 0xffcc00, speedMult: 1.06, feverBonus: 0, daylightBonus: 2, magnetAlways: false, rarity: "rare", collection: "cosmic" },
  { id: "earth", name: "Terra", perk: "+5 s daylight · magnet", price: 700, body: 0x668844, wing: 0x88aa66, belly: 0xccddaa, beak: 0xffaa44, speedMult: 1, feverBonus: 0, daylightBonus: 5, magnetAlways: false, rarity: "rare", collection: "cosmic" },
  { id: "moon", name: "Moonbird", perk: "+4 s daylight · stealth", price: 600, body: 0xccccee, wing: 0xeeeeff, belly: 0xffffff, beak: 0xffdd00, speedMult: 1, feverBonus: 0, daylightBonus: 4, magnetAlways: false, rarity: "rare", collection: "cosmic" },
  { id: "sun", name: "Solar", perk: "+3% speed · +3 s fever", price: 550, body: 0xffcc00, wing: 0xffee66, belly: 0xffffcc, beak: 0xff8800, speedMult: 1.03, feverBonus: 3, daylightBonus: 0, magnetAlways: false, rarity: "rare", collection: "cosmic" },
  { id: "star", name: "Starlight", perk: "+5 s daylight · +2 s fever", price: 650, body: 0xffeeff, wing: 0xffffff, belly: 0xffffff, beak: 0xffdd00, speedMult: 1, feverBonus: 2, daylightBonus: 5, magnetAlways: false, rarity: "rare", collection: "cosmic" },
  { id: "cosmos", name: "Cosmos", perk: "+4% speed · +4 s daylight", price: 700, body: 0x2233aa, wing: 0x4466cc, belly: 0xaabbdd, beak: 0xffaa44, speedMult: 1.04, feverBonus: 0, daylightBonus: 4, magnetAlways: false, rarity: "rare", collection: "cosmic" },
  { id: "nova", name: "Nova", perk: "+5% speed · +2 s fever", price: 600, body: 0xff6644, wing: 0xffaa66, belly: 0xffeedd, beak: 0xffcc00, speedMult: 1.05, feverBonus: 2, daylightBonus: 0, magnetAlways: false, rarity: "rare", collection: "cosmic" },
  { id: "quasar", name: "Quasar", perk: "+3% speed · +5 s daylight", price: 750, body: 0x4466cc, wing: 0x6688ee, belly: 0xaaccff, beak: 0xffaa44, speedMult: 1.03, feverBonus: 0, daylightBonus: 5, magnetAlways: false, rarity: "epic", collection: "cosmic" },
  { id: "pulsar", name: "Pulsar", perk: "+4% speed · +3 s fever", price: 700, body: 0x6644aa, wing: 0x8866cc, belly: 0xccbbff, beak: 0xffaa44, speedMult: 1.04, feverBonus: 3, daylightBonus: 0, magnetAlways: false, rarity: "rare", collection: "cosmic" },
  { id: "aurora_borealis", name: "Aurora Borealis", perk: "+3 s daylight · +3 s fever", price: 800, body: 0x44aa88, wing: 0x66ccaa, belly: 0xaaffcc, beak: 0xffaa44, speedMult: 1, feverBonus: 3, daylightBonus: 3, magnetAlways: false, rarity: "legendary", collection: "cosmic" },
  { id: "solar_flare", name: "Solar Flare", perk: "+6% speed · +2 s fever", price: 850, body: 0xff4400, wing: 0xff8800, belly: 0xffccaa, beak: 0xffaa00, speedMult: 1.06, feverBonus: 2, daylightBonus: 0, magnetAlways: false, rarity: "legendary", collection: "cosmic" },
  { id: "black_hole", name: "Black Hole", perk: "+5 s daylight · magnet", price: 900, body: 0x111122, wing: 0x222244, belly: 0x333355, beak: 0x6666aa, speedMult: 1, feverBonus: 0, daylightBonus: 5, magnetAlways: false, rarity: "mythic", collection: "cosmic" },
  { id: "dark_matter", name: "Dark Matter", perk: "+4% speed · +4 s fever", price: 850, body: 0x1a1a2e, wing: 0x333355, belly: 0x4a4a6a, beak: 0x8888aa, speedMult: 1.04, feverBonus: 4, daylightBonus: 0, magnetAlways: false, rarity: "mythic", collection: "cosmic" },
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
  { id: "stormward", name: "Storm Ward", desc: "Ash clouds and gusts barely touch you", price: 70, icon: "🌩" },
  { id: "hotwings", name: "Hot Wings", desc: "Take off already in Fever", price: 80, icon: "🔥" },
];

/* ---------- shop trails (coins) — prize trails still come from cups ---------- */

export type ShopTrailDef = {
  id: string;
  label: string;
  desc: string;
  price: number;
  /** CSS colors for the shop swatch, mirrors TRAILS[id].colors */
  css: string[];
};

export const SHOP_TRAILS: ShopTrailDef[] = [
  { id: "trail_ember", label: "Emberline", desc: "A streak of live coals", price: 300, css: ["#ff8a3a", "#ff4a2a", "#ffd27a"] },
  { id: "trail_tide", label: "Tideglass", desc: "Cool sea-green ribbon", price: 350, css: ["#3ae0c8", "#2a9ad8", "#c8fff2"] },
  { id: "trail_bloom", label: "Petalfall", desc: "Drifting pink petals", price: 350, css: ["#ff9ac8", "#ff6a9a", "#ffe0ee"] },
  { id: "trail_gold", label: "Goldleaf", desc: "Pure molten gold", price: 500, css: ["#ffd76a", "#ffb020", "#fff2c8"] },
  { id: "trail_void", label: "Voidwake", desc: "Deep-space violet wake", price: 420, css: ["#6a3aff", "#2a1a6a", "#c8a8ff"] },
  { id: "trail_mint", label: "Mintcloud", desc: "Fresh mint vapor", price: 280, css: ["#7affc8", "#3ad89a", "#e0fff2"] },
  { id: "trail_rose", label: "Rosewind", desc: "Warm rose-gold shimmer", price: 380, css: ["#ffb0a0", "#ff7a6a", "#ffe8d8"] },
  { id: "trail_neon", label: "Neonpulse", desc: "Electric arcade glow", price: 450, css: ["#3affff", "#ff3aff", "#ffff3a"] },
];

/** Deterministic daily deal: one boost at half price, same for everyone all day. */
export function dailyDealBoost(dateStr: string): { id: string; price: number } {
  let h = 5381;
  for (let i = 0; i < dateStr.length; i++) h = ((h << 5) + h + dateStr.charCodeAt(i)) >>> 0;
  const def = BOOSTS[h % BOOSTS.length]!;
  return { id: def.id, price: Math.max(10, Math.floor(def.price / 2 / 5) * 5) };
}

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
  /** Present when this boost is today's half-price deal. */
  dealPrice?: number;
};

export type ShopTrailView = {
  def: ShopTrailDef;
  owned: boolean;
  equipped: boolean;
  affordable: boolean;
};
