export const PILOT_PREFIXES = [
  "Sky", "Solar", "Storm", "Zenith", "Aero", "Vortex",
  "Thunder", "Nimbus", "Astra", "Blaze", "Nova", "Cosmic",
  "Hyper", "Sonic", "Apex", "Glide", "Horizon", "Orion",
];

export const PILOT_BIRDS = [
  "Falcon", "Eagle", "Hawk", "Phoenix", "Raven", "Swift",
  "Kestrel", "Gull", "Owl", "Osprey", "Condor", "Harrier",
  "Merlin", "Peregrine", "Plover", "Skimmer",
];

export function generatePilotName(): string {
  const p = PILOT_PREFIXES[Math.floor(Math.random() * PILOT_PREFIXES.length)]!;
  const b = PILOT_BIRDS[Math.floor(Math.random() * PILOT_BIRDS.length)]!;
  const num = Math.floor(10 + Math.random() * 89);
  return `${p}${b}${num}`;
}
