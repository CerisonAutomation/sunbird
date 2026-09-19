export const PILOT_PREFIXES = [
  // Speed / flight
  "Ace", "Aero", "Apex", "Astro", "Blaze", "Bolt", "Burst",
  "Cirrus", "Cloud", "Comet", "Cosmic", "Cyan", "Dawn", "Delta",
  "Dusk", "Echo", "Flash", "Flint", "Frost", "Gale", "Glide",
  "Gust", "Halo", "Hyper", "Ion", "Jet", "Lumen", "Nimbus",
  "Nova", "Nox", "Orion", "Phantom", "Pulse", "Quasar", "Radiant",
  "Rift", "Rogue", "Rush", "Shadow", "Shift", "Sky", "Slipstream",
  "Solar", "Sonic", "Spark", "Star", "Steel", "Storm", "Strafe",
  "Surge", "Thunder", "Turbo", "Twilight", "Veil", "Volt", "Vortex",
  "Wave", "Zenith", "Zero", "Zephyr",
];

export const PILOT_BIRDS = [
  "Albatross", "Buzzard", "Condor", "Crane", "Eagle", "Falcon",
  "Finch", "Gannet", "Goshawk", "Grackle", "Grebe", "Grosbeak",
  "Grouse", "Gull", "Harrier", "Hawk", "Heron", "Hobby",
  "Jay", "Kestrel", "Kingfisher", "Kite", "Lark", "Linnet",
  "Magpie", "Martin", "Merlin", "Nightjar", "Osprey", "Ouzel",
  "Owl", "Peregrine", "Petrel", "Pheasant", "Phoenix", "Pipit",
  "Plover", "Puffin", "Raven", "Redstart", "Robin", "Rook",
  "Sandpiper", "Shearwater", "Skimmer", "Skua", "Snipe", "Sparrow",
  "Starling", "Stint", "Storm", "Swallow", "Swift", "Tanager",
  "Teal", "Tern", "Thrush", "Tit", "Turnstone", "Veery",
  "Vireo", "Warbler", "Wheatear", "Whimbrel", "Whinchat", "Wing",
];

export function generatePilotName(): string {
  const p = PILOT_PREFIXES[Math.floor(Math.random() * PILOT_PREFIXES.length)]!;
  const b = PILOT_BIRDS[Math.floor(Math.random() * PILOT_BIRDS.length)]!;
  const num = Math.floor(10 + Math.random() * 89);
  return `${p}${b}${num}`;
}

// Basic profanity guard for free-text pilot name input (CUSTOM_PILOT_NAMES builds).
// Contains only the most unambiguous slurs / offensive terms; not exhaustive.
// Keep this list updated per Poki's requirements: https://developers.poki.com/guide/requirements-quality
const BLOCKED_PATTERNS = [
  /\bf+u+c+k/i, /\bs+h+i+t/i, /\bc+u+n+t/i, /\bb+i+t+c+h/i,
  /\ba+s+s+h+o+l+e/i, /\bn+i+g+g/i, /\bf+a+g+g/i, /\bd+i+c+k/i,
  /\bc+o+c+k/i, /\bp+u+s+s+y/i, /\bw+h+o+r+e/i, /\bs+l+u+t/i,
];

export function isPilotNameClean(name: string): boolean {
  return !BLOCKED_PATTERNS.some((re) => re.test(name));
}
