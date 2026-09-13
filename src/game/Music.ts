/**
 * 10-track procedural island score for Sunbird.
 *
 * Each track is a self-contained definition with its own chord progressions,
 * melodies, instrument mix, and tempo. The engine selects tracks based on
 * biome and game state, crossfading smoothly between them.
 *
 * Tracks:
 *   1. Island Breeze  — Green Hills (bright, upbeat ukulele folk)
 *   2. Sunset Drift   — Sunset Ridge (warm, mellow, contemplative)
 *   3. Coral Tide     — Tropical Atoll (reggae-tinged, laid-back)
 *   4. Desert Wind    — Dune Sea (epic, expansive, driving)
 *   5. Moonlit Shore  — Midnight Coast (ambient, mysterious)
 *   6. Crystal Peak   — Aurora Peaks (shimmering, soaring)
 *   7. Sunbird Rise   — Menu (energetic, welcoming)
 *   8. Fever Flight   — Fever mode (intense, fast, exhilarating)
 *   9. Starlight Song — Sleep/game-over (music-box lullaby)
 *  10. Trade Winds    — Bonus transition (flowing, gentle)
 *
 * All synthesis is runtime Web Audio — zero audio files.
 */
export type MusicMode = "off" | "menu" | "play" | "fever" | "sleep" | "celebrate";
export type BiomeMusicStyle = "bright" | "warm" | "airy" | "wide" | "night" | "crystal";

/* ── Track definition ─────────────────────────────────────────────── */

interface TrackDef {
  name: string;
  bpm: number;
  /** Chord names — must reference UKE voicings and BASS_ROOT */
  progs: string[][];
  /** Melodies as MIDI note arrays (one entry per eighth note).
   *  0 = rest, -1 = hold previous note. */
  melodies: number[][];
  /** Whistle counter-melody (used in fever-like intensity). */
  whistle: number[];
  /** Strum pattern per eighth: 1=down, 2=up, 0=none */
  strum: number[];
  /** Per-instrument gain multipliers (0-1 scale, relative to defaults). */
  mix: {
    uke: number;
    glock: number;
    bass: number;
    perc: number;
    whistle: number;
  };
  /** Filter cutoff base (Hz) — biome adjustments modify this. */
  filterBase: number;
  /** Swing ratio (0.5 = straight, higher = more swing). */
  swing: number;
}

/* ── Ukulele voicings & bass roots (shared across tracks) ────────── */

type Voicing = number[];

const UKE: Record<string, Voicing> = {
  C:  [67, 60, 64, 72],
  G:  [67, 62, 67, 71],
  Am: [69, 60, 64, 69],
  F:  [69, 60, 65, 69],
  Em: [67, 59, 64, 67],
  Dm: [69, 62, 65, 69],
  A:  [69, 64, 69, 73],
  D:  [69, 62, 66, 74],
  Bm: [67, 59, 62, 67],
  E:  [67, 59, 64, 67],
  Gm: [67, 59, 62, 67],
};

const BASS_ROOT: Record<string, number> = {
  C: 48, G: 43, Am: 45, F: 41, Em: 40, Dm: 38,
  A: 45, D: 50, Bm: 47, E: 52, Gm: 43,
};

/* ── The 10 tracks ───────────────────────────────────────────────── */

const TRACKS: TrackDef[] = [
  /* ─── 1. Island Breeze (Green Hills) ─── */
  {
    name: "Island Breeze",
    bpm: 96,
    progs: [
      ["C", "G", "Am", "F", "C", "G", "F", "G"],
      ["Am", "F", "C", "G", "Am", "F", "C", "G"],
      ["F", "G", "Em", "Am", "F", "G", "C", "C"],
      ["C", "Am", "F", "G", "C", "Am", "G", "G"],
    ],
    melodies: [
      [72, 0, 76, 0, 79, 0, 76, 72,  74, 0, 0, 76, 79, 0, 76, 0,
       72, 0, 74, 0, 76, 0, 79, 76,  74, -1, 0, 0, 72, 0, 74, 0],
      [76, 0, 79, 0, 81, 0, 84, 81,  79, 0, 0, 76, 79, 0, 81, 0,
       76, 0, 74, 0, 72, 0, 74, 76,  79, -1, -1, -1, 0, 0, 0, 0],
      [72, 0, 74, 0, 76, 0, 79, 0,  81, 0, 0, 79, 76, 0, 74, 0,
       72, 0, 69, 0, 72, 0, 76, 0,  74, -1, -1, 0, 0, 0, 0, 0],
      [69, 0, 72, 0, 76, 0, 79, 81,  84, -1, 0, 0, 81, 0, 79, 0,
       76, 0, 74, 0, 72, 0, 74, 0,  72, -1, -1, -1, 0, 0, 0, 0],
    ],
    whistle: [
      0, 0, 79, 0, 81, 0, 84, 0,  81, -1, 0, 0, 0, 0, 79, 81,
      84, -1, 0, 0, 81, 0, 79, 0,  76, -1, -1, 0, 0, 0, 0, 0,
      0, 0, 84, 0, 86, 0, 88, 0,  86, -1, 0, 0, 84, 0, 0, 0,
      81, 0, 79, 0, 76, 0, 74, 0,  72, -1, -1, -1, 0, 0, 0, 0,
    ],
    strum: [1, 0, 1, 2, 0, 2, 1, 2],
    mix: { uke: 1.05, glock: 1.0, bass: 0.9, perc: 0.85, whistle: 0.8 },
    filterBase: 9200,
    swing: 0.56,
  },

  /* ─── 2. Sunset Drift (Sunset Ridge) ─── */
  {
    name: "Sunset Drift",
    bpm: 100,
    progs: [
      ["Am", "Em", "F", "C", "Am", "Em", "Dm", "G"],
      ["F", "C", "Am", "G", "F", "C", "Em", "Am"],
      ["Dm", "Am", "Em", "F", "Dm", "Am", "C", "G"],
      ["Am", "F", "C", "Em", "Am", "F", "G", "Am"],
    ],
    melodies: [
      [69, -1, 0, 0, 72, 0, 76, 0,  74, -1, 0, 0, 69, 0, 65, 0,
       67, -1, 0, 0, 72, -1, 0, 0,  69, -1, 0, 0, 0, 0, 0, 0],
      [76, 0, 74, 0, 72, -1, 0, 0,  69, 0, 72, 0, 76, -1, 0, 0,
       74, 0, 72, 0, 69, -1, -1, 0,  67, 0, 65, 0, 69, -1, 0, 0],
      [74, -1, 0, 0, 72, 0, 69, 0,  67, -1, 0, 0, 72, 0, 76, 0,
       74, -1, 0, 0, 69, 0, 67, 0,  65, -1, -1, -1, 0, 0, 0, 0],
      [69, 0, 0, 72, 76, 0, 0, 74,  72, 0, 0, 69, 72, 0, 76, 0,
       79, -1, 0, 0, 76, 0, 72, 0,  69, -1, -1, -1, 0, 0, 0, 0],
    ],
    whistle: [
      0, 0, 76, 0, 74, 0, 72, 0,  69, -1, 0, 0, 0, 0, 67, 69,
      72, -1, 0, 0, 74, 0, 72, 0,  69, -1, -1, 0, 0, 0, 0, 0,
      0, 0, 79, 0, 77, 0, 76, 0,  74, -1, 0, 0, 72, 0, 0, 0,
      74, 0, 72, 0, 69, 0, 67, 0,  65, -1, -1, -1, 0, 0, 0, 0,
    ],
    strum: [1, 0, 0, 2, 0, 1, 0, 2],
    mix: { uke: 0.85, glock: 0.7, bass: 1.2, perc: 0.5, whistle: 0.6 },
    filterBase: 6200,
    swing: 0.60,
  },

  /* ─── 3. Coral Tide (Tropical Atoll) ─── */
  {
    name: "Coral Tide",
    bpm: 108,
    progs: [
      ["G", "D", "Em", "C", "G", "D", "C", "D"],
      ["Em", "C", "G", "D", "Em", "C", "G", "G"],
      ["C", "G", "D", "Em", "C", "G", "Em", "D"],
      ["G", "Em", "C", "D", "G", "Em", "D", "G"],
    ],
    melodies: [
      [74, 0, 0, 76, 79, 0, 0, 76,  74, 0, 0, 71, 74, 0, 79, 0,
       76, 0, 0, 74, 71, 0, 0, 67,  69, -1, 0, 0, 74, 0, 76, 0],
      [79, -1, 0, 0, 76, 0, 74, 0,  71, -1, 0, 0, 74, 0, 76, 0,
       79, -1, 0, 0, 76, 0, 74, 0,  71, 0, 69, 0, 67, -1, 0, 0],
      [74, 0, 76, 0, 79, 0, 76, 74,  71, 0, 0, 74, 76, 0, 79, 0,
       81, -1, 0, 0, 79, 0, 76, 0,  74, -1, -1, 0, 0, 0, 0, 0],
      [67, 0, 71, 0, 74, 0, 76, 0,  79, -1, 0, 0, 76, 0, 74, 0,
       71, 0, 69, 0, 67, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0],
    ],
    whistle: [
      0, 0, 79, 0, 78, 0, 76, 0,  74, -1, 0, 0, 0, 0, 71, 74,
      76, -1, 0, 0, 74, 0, 71, 0,  69, -1, -1, 0, 0, 0, 0, 0,
      0, 0, 81, 0, 79, 0, 76, 0,  74, -1, 0, 0, 71, 0, 0, 0,
      74, 0, 71, 0, 69, 0, 67, 0,  64, -1, -1, -1, 0, 0, 0, 0,
    ],
    strum: [1, 0, 2, 0, 1, 0, 2, 0],
    mix: { uke: 1.0, glock: 0.95, bass: 0.85, perc: 1.1, whistle: 0.8 },
    filterBase: 10000,
    swing: 0.52,
  },

  /* ─── 4. Desert Wind (Dune Sea) ─── */
  {
    name: "Desert Wind",
    bpm: 118,
    progs: [
      ["Em", "C", "G", "D", "Em", "C", "D", "G"],
      ["G", "D", "Em", "C", "G", "D", "Em", "Em"],
      ["C", "G", "D", "Em", "C", "G", "Em", "D"],
      ["Em", "D", "C", "G", "Em", "D", "G", "Em"],
    ],
    melodies: [
      [76, 0, 79, 0, 83, 0, 79, 76,  74, 0, 0, 71, 76, 0, 79, 0,
       76, -1, 0, 0, 74, 0, 71, 0,  67, -1, 0, 0, 0, 0, 0, 0],
      [79, 0, 83, 0, 86, 0, 83, 79,  76, 0, 0, 74, 79, 0, 83, 0,
       79, -1, 0, 0, 76, 0, 74, 0,  71, -1, -1, 0, 0, 0, 0, 0],
      [74, 0, 76, 0, 79, -1, 0, 0,  83, 0, 79, 0, 76, 0, 74, 0,
       71, 0, 67, 0, 71, 0, 74, 0,  76, -1, -1, -1, 0, 0, 0, 0],
      [67, 0, 71, 0, 74, 0, 76, 79,  83, -1, 0, 0, 79, 0, 76, 0,
       74, 0, 71, 0, 67, -1, 0, 0,  64, -1, -1, -1, 0, 0, 0, 0],
    ],
    whistle: [
      0, 0, 83, 0, 81, 0, 79, 0,  76, -1, 0, 0, 0, 0, 74, 76,
      79, -1, 0, 0, 76, 0, 74, 0,  71, -1, -1, 0, 0, 0, 0, 0,
      0, 0, 86, 0, 83, 0, 79, 0,  76, -1, 0, 0, 74, 0, 0, 0,
      76, 0, 74, 0, 71, 0, 67, 0,  64, -1, -1, -1, 0, 0, 0, 0,
    ],
    strum: [1, 0, 1, 2, 1, 0, 1, 2],
    mix: { uke: 0.8, glock: 0.6, bass: 1.3, perc: 1.0, whistle: 1.0 },
    filterBase: 7500,
    swing: 0.54,
  },

  /* ─── 5. Moonlit Shore (Midnight Coast) ─── */
  {
    name: "Moonlit Shore",
    bpm: 96,
    progs: [
      ["Dm", "Am", "C", "G", "Dm", "Am", "F", "C"],
      ["Am", "Dm", "F", "C", "Am", "Dm", "C", "G"],
      ["F", "C", "Dm", "Am", "F", "C", "Am", "Dm"],
      ["Dm", "F", "C", "Am", "Dm", "F", "G", "Dm"],
    ],
    melodies: [
      [74, -1, 0, 0, 72, 0, 69, 0,  67, -1, 0, 0, 69, 0, 72, 0,
       74, -1, 0, 0, 0, 0, 0, 0,  0, 0, 0, 0, 0, 0, 0, 0],
      [69, 0, 72, 0, 74, -1, 0, 0,  72, 0, 69, 0, 67, -1, 0, 0,
       69, 0, 72, 0, 74, -1, 0, 0,  0, 0, 0, 0, 0, 0, 0, 0],
      [77, 0, 0, 76, 74, 0, 0, 72,  74, -1, 0, 0, 69, 0, 72, 0,
       74, 0, 0, 72, 69, -1, -1, 0,  67, -1, 0, 0, 0, 0, 0, 0],
      [69, 0, 0, 72, 74, 0, 0, 72,  69, -1, 0, 0, 67, 0, 69, 0,
       72, -1, 0, 0, 69, 0, 67, 0,  65, -1, -1, -1, 0, 0, 0, 0],
    ],
    whistle: [
      0, 0, 74, 0, 73, 0, 72, 0,  69, -1, 0, 0, 0, 0, 67, 69,
      72, -1, 0, 0, 69, 0, 67, 0,  65, -1, -1, 0, 0, 0, 0, 0,
      0, 0, 77, 0, 76, 0, 74, 0,  72, -1, 0, 0, 69, 0, 0, 0,
      72, 0, 69, 0, 67, 0, 65, 0,  62, -1, -1, -1, 0, 0, 0, 0,
    ],
    strum: [1, 0, 0, 0, 1, 0, 0, 0],
    mix: { uke: 0.6, glock: 1.2, bass: 0.8, perc: 0.35, whistle: 0.55 },
    filterBase: 4500,
    swing: 0.58,
  },

  /* ─── 6. Crystal Peak (Aurora Peaks) ─── */
  {
    name: "Crystal Peak",
    bpm: 120,
    progs: [
      ["F", "C", "Am", "G", "F", "C", "G", "Am"],
      ["Am", "F", "C", "G", "Am", "F", "C", "C"],
      ["C", "G", "Am", "F", "C", "G", "F", "Am"],
      ["F", "Am", "C", "G", "F", "Am", "G", "F"],
    ],
    melodies: [
      [81, 0, 84, 0, 81, 79, 76, 0,  79, 0, 0, 76, 79, 0, 84, 0,
       81, -1, 0, 0, 79, 0, 76, 0,  74, -1, 0, 0, 0, 0, 0, 0],
      [84, 0, 81, 0, 79, 0, 76, 79,  81, 0, 0, 84, 81, 0, 79, 0,
       76, -1, 0, 0, 79, 0, 81, 0,  84, -1, -1, 0, 0, 0, 0, 0],
      [76, 0, 79, 0, 81, -1, 0, 0,  84, 0, 81, 0, 79, 0, 76, 0,
       74, 0, 71, 0, 74, 0, 76, 0,  79, -1, -1, -1, 0, 0, 0, 0],
      [71, 0, 74, 0, 76, 0, 79, 81,  84, -1, 0, 0, 81, 0, 79, 0,
       76, 0, 74, 0, 71, -1, 0, 0,  69, -1, -1, -1, 0, 0, 0, 0],
    ],
    whistle: [
      0, 0, 84, 0, 83, 0, 81, 0,  79, -1, 0, 0, 0, 0, 76, 79,
      81, -1, 0, 0, 84, 0, 81, 0,  79, -1, -1, 0, 0, 0, 0, 0,
      0, 0, 88, 0, 86, 0, 84, 0,  81, -1, 0, 0, 79, 0, 0, 0,
      81, 0, 79, 0, 76, 0, 74, 0,  71, -1, -1, -1, 0, 0, 0, 0,
    ],
    strum: [1, 0, 1, 2, 0, 2, 1, 2],
    mix: { uke: 0.75, glock: 1.3, bass: 0.85, perc: 0.7, whistle: 0.95 },
    filterBase: 10500,
    swing: 0.55,
  },

  /* ─── 7. Sunbird Rise (Menu) ─── */
  {
    name: "Sunbird Rise",
    bpm: 116,
    progs: [
      ["C", "F", "G", "C", "C", "F", "G", "Am"],
      ["Am", "F", "G", "C", "Am", "F", "C", "G"],
      ["F", "G", "C", "Am", "F", "G", "Am", "C"],
      ["C", "Am", "F", "G", "C", "Am", "G", "C"],
    ],
    melodies: [
      [72, 0, 76, 0, 79, 0, 84, 79,  76, 0, 0, 79, 84, 0, 79, 0,
       76, 0, 74, 0, 76, 0, 79, 76,  74, -1, 0, 0, 72, 0, 76, 0],
      [79, 0, 84, 0, 81, 0, 79, 84,  86, 0, 0, 84, 79, 0, 76, 0,
       74, 0, 76, 0, 79, 0, 81, 0,  76, -1, -1, 0, 0, 0, 0, 0],
      [72, 0, 76, 0, 79, 0, 81, 0,  84, 0, 81, 0, 79, 0, 76, 0,
       74, -1, 0, 0, 76, 0, 79, 0,  76, -1, -1, -1, 0, 0, 0, 0],
      [69, 0, 72, 0, 76, 0, 79, 81,  84, 86, 0, 84, 79, 0, 76, 0,
       74, -1, 0, 0, 76, 0, 79, 0,  76, -1, -1, -1, 0, 0, 0, 0],
    ],
    whistle: [
      0, 0, 84, 0, 86, 0, 88, 0,  86, -1, 0, 0, 0, 0, 84, 86,
      88, -1, 0, 0, 84, 0, 81, 0,  79, -1, -1, 0, 0, 0, 0, 0,
      0, 0, 88, 0, 86, 0, 84, 0,  81, -1, 0, 0, 79, 0, 0, 0,
      81, 0, 79, 0, 76, 0, 74, 0,  72, -1, -1, -1, 0, 0, 0, 0,
    ],
    strum: [1, 0, 1, 2, 0, 2, 1, 2],
    mix: { uke: 1.1, glock: 1.05, bass: 0.95, perc: 0.9, whistle: 0.95 },
    filterBase: 9400,
    swing: 0.56,
  },

  /* ─── 8. Fever Flight (Fever mode) ─── */
  {
    name: "Fever Flight",
    bpm: 132,
    progs: [
      ["G", "Em", "C", "D", "G", "Em", "D", "C"],
      ["Em", "C", "G", "D", "Em", "C", "G", "G"],
      ["C", "G", "D", "Em", "C", "G", "Em", "D"],
      ["G", "D", "Em", "C", "G", "D", "C", "G"],
    ],
    melodies: [
      [79, 0, 83, 0, 86, 0, 83, 79,  76, 0, 0, 74, 79, 0, 83, 0,
       79, -1, 0, 0, 76, 0, 74, 0,  71, -1, 0, 0, 0, 0, 0, 0],
      [83, 0, 79, 0, 76, 0, 79, 83,  86, 0, 0, 83, 79, 0, 76, 0,
       74, 0, 71, 0, 74, 0, 76, 0,  79, -1, -1, 0, 0, 0, 0, 0],
      [74, 0, 76, 0, 79, -1, 0, 0,  83, 0, 79, 0, 76, 0, 74, 0,
       71, 0, 67, 0, 71, 0, 74, 0,  76, -1, -1, -1, 0, 0, 0, 0],
      [67, 0, 71, 0, 74, 0, 76, 79,  83, -1, 0, 0, 79, 0, 76, 0,
       74, 0, 71, 0, 67, -1, 0, 0,  64, -1, -1, -1, 0, 0, 0, 0],
    ],
    whistle: [
      0, 0, 86, 0, 84, 0, 83, 0,  79, -1, 0, 0, 0, 0, 76, 79,
      83, -1, 0, 0, 79, 0, 76, 0,  74, -1, -1, 0, 0, 0, 0, 0,
      0, 0, 88, 0, 86, 0, 83, 0,  79, -1, 0, 0, 76, 0, 0, 0,
      79, 0, 76, 0, 74, 0, 71, 0,  67, -1, -1, -1, 0, 0, 0, 0,
    ],
    strum: [1, 2, 1, 2, 1, 2, 1, 2],
    mix: { uke: 0.9, glock: 0.85, bass: 1.1, perc: 1.3, whistle: 1.2 },
    filterBase: 10000,
    swing: 0.52,
  },

  /* ─── 9. Starlight Song (Sleep / game-over) ─── */
  {
    name: "Starlight Song",
    bpm: 80,
    progs: [
      ["C", "Am", "F", "G", "C", "Am", "F", "G"],
      ["Am", "F", "C", "G", "Am", "F", "C", "C"],
      ["F", "C", "Am", "G", "F", "C", "G", "Am"],
      ["C", "G", "Am", "F", "C", "G", "F", "C"],
    ],
    melodies: [
      [72, -1, 0, 76, 79, -1, 0, 76,  74, -1, 0, 72, 69, -1, 0, 0,
       67, -1, 0, 72, 76, -1, 0, 0,  72, -1, -1, -1, 0, 0, 0, 0],
      [69, -1, 0, 72, 76, -1, 0, 72,  69, -1, 0, 67, 64, -1, 0, 0,
       67, -1, 0, 69, 72, -1, 0, 0,  69, -1, -1, -1, 0, 0, 0, 0],
      [65, -1, 0, 69, 72, -1, 0, 69,  67, -1, 0, 65, 62, -1, 0, 0,
       65, -1, 0, 67, 72, -1, 0, 0,  69, -1, -1, -1, 0, 0, 0, 0],
      [64, -1, 0, 67, 72, -1, 0, 67,  64, -1, 0, 62, 60, -1, 0, 0,
       62, -1, 0, 64, 67, -1, 0, 0,  64, -1, -1, -1, 0, 0, 0, 0],
    ],
    whistle: [
      0, 0, 72, 0, 71, 0, 69, 0,  67, -1, 0, 0, 0, 0, 64, 67,
      69, -1, 0, 0, 67, 0, 64, 0,  62, -1, -1, 0, 0, 0, 0, 0,
      0, 0, 76, 0, 74, 0, 72, 0,  69, -1, 0, 0, 67, 0, 0, 0,
      69, 0, 67, 0, 64, 0, 62, 0,  60, -1, -1, -1, 0, 0, 0, 0,
    ],
    strum: [1, 0, 0, 0, 1, 0, 0, 0],
    mix: { uke: 0.7, glock: 1.1, bass: 0.5, perc: 0.0, whistle: 0.4 },
    filterBase: 5500,
    swing: 0.62,
  },

  /* ─── 10. Trade Winds (Bonus transition) ─── */
  {
    name: "Trade Winds",
    bpm: 104,
    progs: [
      ["D", "A", "Bm", "G", "D", "A", "G", "Bm"],
      ["Bm", "G", "D", "A", "Bm", "G", "D", "D"],
      ["G", "D", "A", "Bm", "G", "D", "Bm", "A"],
      ["D", "Bm", "G", "A", "D", "Bm", "A", "D"],
    ],
    melodies: [
      [74, 0, 78, 0, 81, 0, 78, 74,  71, 0, 0, 69, 74, 0, 78, 0,
       74, -1, 0, 0, 71, 0, 69, 0,  66, -1, 0, 0, 0, 0, 0, 0],
      [78, 0, 74, 0, 71, 0, 74, 78,  81, 0, 0, 78, 74, 0, 71, 0,
       69, 0, 66, 0, 69, 0, 71, 0,  74, -1, -1, 0, 0, 0, 0, 0],
      [69, 0, 71, 0, 74, -1, 0, 0,  78, 0, 74, 0, 71, 0, 69, 0,
       66, 0, 62, 0, 66, 0, 69, 0,  71, -1, -1, -1, 0, 0, 0, 0],
      [66, 0, 69, 0, 71, 0, 74, 78,  81, -1, 0, 0, 78, 0, 74, 0,
       71, 0, 69, 0, 66, -1, 0, 0,  62, -1, -1, -1, 0, 0, 0, 0],
    ],
    whistle: [
      0, 0, 78, 0, 77, 0, 74, 0,  71, -1, 0, 0, 0, 0, 69, 71,
      74, -1, 0, 0, 71, 0, 69, 0,  66, -1, -1, 0, 0, 0, 0, 0,
      0, 0, 81, 0, 78, 0, 74, 0,  71, -1, 0, 0, 69, 0, 0, 0,
      71, 0, 69, 0, 66, 0, 62, 0,  59, -1, -1, -1, 0, 0, 0, 0,
    ],
    strum: [1, 0, 1, 2, 0, 2, 1, 2],
    mix: { uke: 0.95, glock: 0.9, bass: 1.05, perc: 0.75, whistle: 0.7 },
    filterBase: 8200,
    swing: 0.55,
  },
];

/* ── Biome → track mapping ───────────────────────────────────────── */

const BIOME_TRACK: Record<BiomeMusicStyle, number> = {
  bright:  0,  // Island Breeze
  warm:    1,  // Sunset Drift
  airy:    2,  // Coral Tide
  wide:    3,  // Desert Wind
  night:   4,  // Moonlit Shore
  crystal: 5,  // Crystal Peak
};

/* ── Music engine ────────────────────────────────────────────────── */

const TICK_MS = 25;
const LOOKAHEAD = 0.16;
const CROSSFADE_S = 1.8;

function mtof(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export class Music {
  private mode: MusicMode = "off";
  private targetMode: MusicMode = "off";
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private bar = 0;
  private section = 0;
  private night = 0;
  private baseLevel = 0;
  private lullabyStep = 0;
  private dynMult = 1.0;  // per-bar dynamics multiplier for organic variation

  /* Current track state */
  private trackIdx = -1;
  private trackDef: TrackDef = TRACKS[0];
  private trackBpm = TRACKS[0].bpm;
  private targetTrackIdx = -1;

  /* Crossfade */
  private fadeGain: GainNode;
  private fadeGainB: GainNode;

  /* Audio graph — dual bus for crossfading */
  private readonly busA: GainNode;
  private readonly busB: GainNode;
  private readonly filterA: BiquadFilterNode;
  private readonly filterB: BiquadFilterNode;
  private readonly duckGain: GainNode;

  /* Per-instrument gains (active bus) */
  private ukeGain: GainNode;
  private glockGain: GainNode;
  private bassGain: GainNode;
  private percGain: GainNode;
  private whistleGain: GainNode;
  private lullabyGain: GainNode;

  /* Second bus instruments (for crossfade) */
  private ukeGainB: GainNode;
  private glockGainB: GainNode;
  private bassGainB: GainNode;
  private percGainB: GainNode;
  private whistleGainB: GainNode;
  private lullabyGainB: GainNode;

  private readonly noise: AudioBuffer;
  private fadeTimer: number | null = null;

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    private readonly reverbSend: AudioNode,
  ) {
    /* Master duck */
    this.duckGain = ctx.createGain();
    this.duckGain.gain.value = 1;
    this.duckGain.connect(destination);

    /* Bus A */
    this.busA = ctx.createGain();
    this.busA.gain.value = 0;
    this.filterA = ctx.createBiquadFilter();
    this.filterA.type = "lowpass";
    this.filterA.frequency.value = 9000;
    this.filterA.Q.value = 0.4;
    this.fadeGain = ctx.createGain();
    this.fadeGain.gain.value = 1;
    this.busA.connect(this.filterA);
    this.filterA.connect(this.fadeGain);
    this.fadeGain.connect(this.duckGain);

    /* Bus B (for crossfade) */
    this.busB = ctx.createGain();
    this.busB.gain.value = 0;
    this.filterB = ctx.createBiquadFilter();
    this.filterB.type = "lowpass";
    this.filterB.frequency.value = 9000;
    this.filterB.Q.value = 0.4;
    this.fadeGainB = ctx.createGain();
    this.fadeGainB.gain.value = 0;
    this.busB.connect(this.filterB);
    this.filterB.connect(this.fadeGainB);
    this.fadeGainB.connect(this.duckGain);

    /* Instrument gains — bus A */
    const mkA = (v: number): GainNode => {
      const g = ctx.createGain(); g.gain.value = v; g.connect(this.busA); return g;
    };
    this.ukeGain = mkA(0.34);
    this.glockGain = mkA(0.3);
    this.bassGain = mkA(0.42);
    this.percGain = mkA(0);
    this.whistleGain = mkA(0);
    this.lullabyGain = mkA(0);

    /* Instrument gains — bus B */
    const mkB = (v: number): GainNode => {
      const g = ctx.createGain(); g.gain.value = v; g.connect(this.busB); return g;
    };
    this.ukeGainB = mkB(0);
    this.glockGainB = mkB(0);
    this.bassGainB = mkB(0);
    this.percGainB = mkB(0);
    this.whistleGainB = mkB(0);
    this.lullabyGainB = mkB(0);

    /* Shared noise buffer */
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /* ── Public API ────────────────────────────────────────────────── */

  setMode(mode: MusicMode): void {
    if (mode === this.targetMode) return;
    this.targetMode = mode;
    this.applyMode();
  }

  setNight(t: number): void {
    this.night = Math.max(0, Math.min(1, t));
    const base = this.trackDef.filterBase;
    const nightMod = base - this.night * (base - 2600);
    const tc = this.ctx.currentTime;
    this.filterA.frequency.setTargetAtTime(nightMod, tc, 0.6);
    this.filterB.frequency.setTargetAtTime(nightMod, tc, 0.6);
  }

  setLevel(level: number): void {
    this.baseLevel = level;
    this.applyMode();
  }

  /**
   * Set biome style — selects the appropriate track and crossfades.
   */
  setBiome(style: BiomeMusicStyle): void {
    const trackIdx = BIOME_TRACK[style] ?? 0;
    if (trackIdx === this.trackIdx && this.mode !== "off") return;
    this.targetTrackIdx = trackIdx;
    if (this.mode !== "off" && this.trackIdx >= 0) {
      this.startCrossfade(trackIdx);
    } else {
      this.switchTrack(trackIdx);
    }
  }

  /**
   * Force a specific track by index (for menu/fever/sleep overrides).
   */
  setTrack(idx: number): void {
    if (idx < 0 || idx >= TRACKS.length) return;
    if (idx === this.trackIdx) return;
    if (this.mode !== "off" && this.trackIdx >= 0) {
      this.startCrossfade(idx);
    } else {
      this.switchTrack(idx);
    }
  }

  /**
   * Get the current track name (for HUD display).
   */
  getTrackName(): string {
    return this.trackDef.name;
  }

  /**
   * Get total number of tracks.
   */
  getTrackCount(): number {
    return TRACKS.length;
  }

  duck(amount = 0.45, release = 0.5): void {
    const t = this.ctx.currentTime;
    this.duckGain.gain.cancelScheduledValues(t);
    this.duckGain.gain.setTargetAtTime(1 - amount, t, 0.02);
    this.duckGain.gain.setTargetAtTime(1, t + 0.12, release);
  }

  dispose(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    if (this.fadeTimer !== null) window.clearInterval(this.fadeTimer);
    this.timer = null;
    this.fadeTimer = null;
  }

  /* ── Track selection ───────────────────────────────────────────── */

  private switchTrack(idx: number): void {
    this.trackIdx = idx;
    this.trackDef = TRACKS[idx];
    this.trackBpm = this.trackDef.bpm;
    this.step = 0;
    this.bar = 0;
    this.section = 0;
    this.applyTrackMix(this.ukeGain, this.glockGain, this.bassGain, this.percGain, this.whistleGain);
    this.applyTrackFilter(this.filterA);
  }

  private startCrossfade(newIdx: number): void {
    /* Cancel any in-progress crossfade and land immediately */
    if (this.fadeTimer !== null) {
      window.clearInterval(this.fadeTimer);
      this.fadeTimer = null;
      this.finishCrossfade();
    }
    this.targetTrackIdx = newIdx;

    /* Prepare bus B with new track — gains are set instantly, crossfade
       is controlled by fadeGain/fadeGainB so bus B stays silent until
       fadeGainB ramps up. */
    this.trackDef = TRACKS[newIdx];
    this.applyTrackMix(this.ukeGainB, this.glockGainB, this.bassGainB, this.percGainB, this.whistleGainB);
    this.applyTrackFilter(this.filterB);

    /* Crossfade — fadeGain ramps to 0 (old track out),
       fadeGainB ramps to 1 (new track in) */
    const t = this.ctx.currentTime;
    this.fadeGain.gain.setTargetAtTime(0, t, CROSSFADE_S / 4);
    this.fadeGainB.gain.setTargetAtTime(1, t, CROSSFADE_S / 4);

    /* After crossfade completes, swap buses */
    const steps = Math.ceil((CROSSFADE_S * 1000) / TICK_MS);
    let elapsed = 0;
    this.fadeTimer = window.setInterval(() => {
      elapsed++;
      if (elapsed >= steps) {
        if (this.fadeTimer !== null) window.clearInterval(this.fadeTimer);
        this.fadeTimer = null;
        this.finishCrossfade();
      }
    }, TICK_MS);
  }

  private finishCrossfade(): void {
    this.trackIdx = this.targetTrackIdx;
    this.trackDef = TRACKS[this.trackIdx];
    this.trackBpm = this.trackDef.bpm;
    this.step = 0;
    this.bar = 0;
    this.section = 0;

    /* Swap gain references so new track plays on bus A going forward */
    const tmpUke = this.ukeGain; this.ukeGain = this.ukeGainB; this.ukeGainB = tmpUke;
    const tmpGlock = this.glockGain; this.glockGain = this.glockGainB; this.glockGainB = tmpGlock;
    const tmpBass = this.bassGain; this.bassGain = this.bassGainB; this.bassGainB = tmpBass;
    const tmpPerc = this.percGain; this.percGain = this.percGainB; this.percGainB = tmpPerc;
    const tmpWhistle = this.whistleGain; this.whistleGain = this.whistleGainB; this.whistleGainB = tmpWhistle;
    const tmpLullaby = this.lullabyGain; this.lullabyGain = this.lullabyGainB; this.lullabyGainB = tmpLullaby;

    /* Snap fade gains — crossfade is complete, no ramp needed */
    const t = this.ctx.currentTime;
    this.fadeGain.gain.setValueAtTime(1, t);
    this.fadeGainB.gain.setValueAtTime(0, t);
  }

  private applyTrackMix(
    uke: GainNode, glock: GainNode, bass: GainNode,
    perc: GainNode, whistle: GainNode,
  ): void {
    const mix = this.trackDef.mix;
    const t = this.ctx.currentTime;
    uke.gain.setTargetAtTime(0.34 * mix.uke, t, 0.3);
    glock.gain.setTargetAtTime(0.3 * mix.glock, t, 0.3);
    bass.gain.setTargetAtTime(0.42 * mix.bass, t, 0.3);
    perc.gain.setTargetAtTime(0.28 * mix.perc, t, 0.3);
    whistle.gain.setTargetAtTime(0.22 * mix.whistle, t, 0.3);
  }

  private applyTrackFilter(filter: BiquadFilterNode): void {
    filter.frequency.setTargetAtTime(this.trackDef.filterBase, this.ctx.currentTime, 0.3);
  }

  /* ── Mode application ──────────────────────────────────────────── */

  private applyMode(): void {
    const t = this.ctx.currentTime;
    const m = this.targetMode;
    const on = this.baseLevel > 0 && m !== "off";
    this.busA.gain.setTargetAtTime(on ? this.baseLevel : 0, t, 0.5);
    this.busB.gain.setTargetAtTime(on ? this.baseLevel : 0, t, 0.5);

    const song = m === "menu" || m === "play" || m === "fever";
    const mix = this.trackDef.mix;

    this.ukeGain.gain.setTargetAtTime(
      song ? (m === "menu" ? 0.16 * mix.uke : 0.26 * mix.uke) : 0, t, 0.4,
    );
    this.glockGain.gain.setTargetAtTime(
      song ? (m === "menu" ? 0.58 * mix.glock : 0.65 * mix.glock) : 0, t, 0.4,
    );
    this.bassGain.gain.setTargetAtTime(song ? (m === "menu" ? 0.22 * mix.bass : 0.30 * mix.bass) : 0, t, 0.4);
    this.percGain.gain.setTargetAtTime(
      m === "play" ? 0.24 * mix.perc : m === "fever" ? 0.32 * mix.perc : 0, t, 0.3,
    );
    this.whistleGain.gain.setTargetAtTime(
      m === "fever" ? 0.28 * mix.whistle : (song ? 0.14 * mix.whistle : 0), t, 0.3,
    );
    this.lullabyGain.gain.setTargetAtTime(m === "sleep" ? 0.3 : 0, t, 0.6);
    this.lullabyGainB.gain.setTargetAtTime(m === "sleep" ? 0.3 : 0, t, 0.6);

    /* Fever uses fever track, sleep uses sleep track */
    if (m === "fever" && this.trackIdx !== 7) {
      this.setTrack(7);  // Fever Flight
    } else if (m === "sleep" && this.trackIdx !== 8) {
      this.setTrack(8);  // Starlight Song
    } else if ((m === "menu" || m === "play") && (this.trackIdx === 7 || this.trackIdx === 8)) {
      /* Return to biome track from fever/sleep */
      this.setTrack(this.targetTrackIdx >= 0 ? this.targetTrackIdx : 0);
    }

    /* BPM */
    if (m === "fever") {
      this.trackBpm = this.trackDef.bpm + 14;
    } else if (m === "sleep") {
      this.trackBpm = this.trackDef.bpm;
    } else {
      this.trackBpm = this.trackDef.bpm;
    }

    if (this.mode === "off" && m !== "off") this.start();
    this.mode = m;
  }

  /* ── Scheduler ─────────────────────────────────────────────────── */

  private start(): void {
    if (this.timer !== null) return;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.step = 0;
    this.bar = 0;
    this.section = 0;
    this.lullabyStep = 0;
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  private tick(): void {
    if (this.ctx.state !== "running") return;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      if (this.mode === "sleep") this.scheduleLullaby(this.nextTime);
      else if (this.mode === "celebrate") this.scheduleCelebrate(this.nextTime);
      else this.scheduleStep(this.nextTime);
      this.advance();
    }
  }

  private advance(): void {
    const beat = 60 / this.trackBpm;
    const swing = this.mode === "sleep" ? 0.5 : this.mode === "celebrate" ? 0.55 : this.trackDef.swing;
    const speedMult = this.mode === "celebrate" ? 1.3 : 1; // Faster during celebration
    const dur = this.step % 2 === 0 ? beat * swing : beat * (1 - swing);
    this.nextTime += this.mode === "sleep" ? beat * 0.75 : dur / speedMult;
    this.step += 1;
    if (this.step >= 8) {
      this.step = 0;
      this.bar += 1;
      /* Refresh dynamics every bar — quiet bars create organic breathing */
      const quiet = this.bar % 4 === 3;  // every 4th bar is softer
      this.dynMult = quiet ? 0.55 + Math.random() * 0.2 : 0.82 + Math.random() * 0.18;
      if (this.bar >= 8) {
        this.bar = 0;
        this.section = (this.section + 1) % this.trackDef.progs.length;
      }
    }
  }

  /* ── Step scheduler (per track) ────────────────────────────────── */

  private scheduleStep(t: number): void {
    const track = this.trackDef;
    const chordName = track.progs[this.section]![this.bar]!;
    const chord = UKE[chordName];
    if (!chord) return;
    const idx = this.bar * 8 + this.step;
    const beat = 60 / this.trackBpm;

    /* Ukulele strum — softened for ambient feel */
    const strum = track.strum[this.step]!;
    if (strum) {
      // Reduce strum velocity by 40% for gentler sound
      const accent = this.step === 0 ? 0.6 : this.step === 4 ? 0.5 : 0.35;
      const order = strum === 1 ? chord : [...chord].reverse();
      order.forEach((m, i) => this.pluck(t + i * 0.011, mtof(m), accent * this.dynMult * (0.7 + 0.3 * Math.random())));
    }

    /* Bass */
    if (this.step === 0) this.bass(t, mtof(BASS_ROOT[chordName]!), beat * 0.9);
    if (this.step === 4) this.bass(t, mtof(BASS_ROOT[chordName]! + (this.bar % 2 ? 7 : 0)), beat * 0.8);
    if (this.step === 7 && this.bar % 4 === 3) {
      const walk = BASS_ROOT[chordName]! + 5;
      if (BASS_ROOT[chordName] !== undefined) this.bass(t, mtof(walk), beat * 0.4);
    }

    /* Melody (glockenspiel + warm sine doubler on strong beats) */
    const mel = track.melodies[this.section % track.melodies.length]!;
    const note = mel[idx] ?? 0;
    if (note > 0) {
      const vel = (this.step === 0 ? 0.62 : this.step === 4 ? 0.52 : 0.40) * this.dynMult;
      this.glock(t, mtof(note), vel);
      // Warm sine doubler on beat-1 and beat-5 — gives melody a human "voice"
      if (this.step === 0 || this.step === 4) {
        this.leadSine(t, mtof(note), beat * 0.85, vel * 0.32);
      }
    }

    /* Chord stab every 2 bars — brief marimba shimmer, no hum */
    if (this.step === 0 && this.bar % 2 === 0) {
      this.chordStab(t, chord);
    }

    /* Whistle counter-melody in play + fever — subtle and atmospheric */
    if (this.mode === "play" || this.mode === "fever") {
      const wh = track.whistle[idx] ?? 0;
      if (wh > 0) {
        let len = 1;
        while (track.whistle[idx + len] === -1) len++;
        // Reduce whistle volume by 50% for less distracting sound
        const whVol = this.mode === "fever" ? 0.5 : 0.25;
        this.whistle(t, mtof(wh), beat * 0.5 * len * 0.95 * whVol);
      }
    }

    /* Rising arpeggio fill on last bar of each section — Journey-style climax */
    if (this.bar === 7 && this.step === 6) {
      const nextSec = (this.section + 1) % track.progs.length;
      const nextChordName = track.progs[nextSec]![0]!;
      const nextChord = UKE[nextChordName];
      if (nextChord) {
        nextChord.forEach((m, i) => {
          this.glock(t + i * beat * 0.2, mtof(m + 12), 0.45 * this.dynMult);
        });
      }
    }

    /* Percussion — quarter-note kick, sparse shaker — gentler for ambient feel */
    if (this.mode === "play" || this.mode === "fever") {
      /* Shaker: quarter notes only + occasional 8th-note fills */
      const onQuarter = this.step % 2 === 0;
      if (onQuarter) {
        /* Drop more off-beats for breathing room */
        const skipOffbeat = this.step !== 0 && this.step !== 4 && Math.random() < 0.6; // Increased from 0.4
        if (!skipOffbeat) this.shaker(t, (this.step === 0 ? 0.35 : 0.20) * this.dynMult); // Reduced volumes
      } else if (this.mode === "fever" && Math.random() < 0.25) { // Reduced from 0.35
        /* 8th-note shaker only in fever, sparsely */
        this.shaker(t, 0.12 * this.dynMult); // Reduced from 0.18
      }
      // Kick on quarter notes
      if (this.step === 0 || this.step === 4) this.kick(t, (this.step === 0 ? 0.6 : 0.5) * this.dynMult); // Reduced from 1.0/0.8
      if (this.mode === "fever" && (this.step === 2 || this.step === 6)) this.clap(t);
      if (this.step === 7 && this.bar % 2 === 1) this.shaker(t + beat * 0.22, 0.2 * this.dynMult); // Reduced from 0.3
    }

  }

  /* ── Lullaby (sleep mode — shared music-box) ───────────────────── */

  private scheduleLullaby(t: number): void {
    const arp = [60, 64, 67, 71, 72, 71, 67, 64];
    const m = arp[this.lullabyStep % arp.length]!;
    this.lullabyStep += 1;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.value = mtof(m + 12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(g);
    g.connect(this.lullabyGain);
    g.connect(this.reverbSend);
    o.start(t);
    o.stop(t + 1.5);
  }

  /** Celebrate mode — bright, fast arpeggios with shimmer for unlock moments */
  private scheduleCelebrate(t: number): void {
    // Ascending celebration arpeggio in C major
    const arp = [60, 64, 67, 72, 76, 79, 84, 79];
    const m = arp[this.step % arp.length]!;
    const vel = 0.08 + (this.step % 4 === 0 ? 0.04 : 0); // Accent on beats

    // Ukulele pluck — bright and fast
    this.pluck(t, mtof(m), vel);

    // Add shimmer on even steps
    if (this.step % 2 === 0) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "sine";
      o.frequency.value = mtof(m + 24); // Octave up shimmer
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.04, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g);
      g.connect(this.reverbSend);
      o.start(t);
      o.stop(t + 0.5);
    }

    // Glockenspiel sparkle on beat 1
    if (this.step === 0) {
      this.glock(t, mtof(m + 12), 0.06);
    }
  }

  /* ── Instruments ───────────────────────────────────────────────── */

  private pluck(t: number, freq: number, vel: number): void {
    const o = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    o.type = "triangle";
    o2.type = "sawtooth";
    o.frequency.value = freq;
    o2.frequency.value = freq * 1.003;
    f.type = "lowpass";
    f.frequency.setValueAtTime(freq * 4, t);
    f.frequency.exponentialRampToValueAtTime(freq * 1.3, t + 0.3);
    f.Q.value = 0.9;
    const peak = 0.18 * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(peak * 0.32, t + 0.14);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    const mix2 = this.ctx.createGain();
    mix2.gain.value = 0.16;
    o.connect(f);
    o2.connect(mix2);
    mix2.connect(f);
    f.connect(g);
    g.connect(this.ukeGain);
    o.start(t);
    o2.start(t);
    o.stop(t + 0.6);
    o2.stop(t + 0.6);
  }

  private glock(t: number, freq: number, vel: number): void {
    const g = this.ctx.createGain();
    const peak = 0.38 * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.003);
    g.gain.exponentialRampToValueAtTime(peak * 0.3, t + 0.14);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    const partials: [number, number][] = [
      [1, 1], [2.76, 0.28], [5.4, 0.09],
    ];
    for (const [ratio, amp] of partials) {
      const o = this.ctx.createOscillator();
      const pg = this.ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq * ratio;
      pg.gain.value = amp;
      o.connect(pg);
      pg.connect(g);
      o.start(t);
      o.stop(t + 1.8);
    }
    g.connect(this.glockGain);
    const send = this.ctx.createGain();
    send.gain.value = 0.28;
    g.connect(send);
    send.connect(this.reverbSend);
  }

  /** Warm sine doubler — short vibrato note that thickens the melody on strong beats */
  private leadSine(t: number, freq: number, dur: number, vel: number): void {
    const o = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lfoG = this.ctx.createGain();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq * 0.998, t);
    lfo.type = "sine";
    lfo.frequency.value = 4.8;
    lfoG.gain.value = freq * 0.005;
    lfo.connect(lfoG);
    lfoG.connect(o.frequency);
    const peak = 0.22 * vel;
    const decay = Math.min(dur * 0.7, 0.55); // never sustains
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.035);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g);
    g.connect(this.glockGain);
    const send = this.ctx.createGain();
    send.gain.value = 0.12;
    g.connect(send);
    send.connect(this.reverbSend);
    o.start(t); lfo.start(t);
    o.stop(t + decay + 0.05); lfo.stop(t + decay + 0.05);
  }

  /** Brief marimba-style chord stab — no sustained hum, just a sparkle of harmony */
  private chordStab(t: number, chordNotes: Voicing): void {
    const voices = chordNotes.slice(0, 3);
    const amps = [0.22, 0.14, 0.09];
    for (let i = 0; i < voices.length; i++) {
      const freq = mtof(voices[i]! + 12); // octave up for clarity
      const o = this.ctx.createOscillator();
      const pg = this.ctx.createGain();
      o.type = "triangle";
      o.frequency.value = freq;
      const peak = amps[i]!;
      pg.gain.setValueAtTime(0.0001, t);
      pg.gain.exponentialRampToValueAtTime(peak, t + 0.004);
      pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(pg);
      pg.connect(this.glockGain);
      const rev = this.ctx.createGain();
      rev.gain.value = 0.18;
      pg.connect(rev);
      rev.connect(this.reverbSend);
      o.start(t);
      o.stop(t + 1.0);
    }
  }

  private whistle(t: number, freq: number, dur: number): void {
    const o = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lfoG = this.ctx.createGain();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq * 0.985, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
    lfo.type = "sine";
    lfo.frequency.value = 5.6;
    lfoG.gain.value = freq * 0.012;
    lfo.connect(lfoG);
    lfoG.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.05);
    g.gain.setValueAtTime(0.18, t + Math.max(0.06, dur - 0.08));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    const breath = this.ctx.createBufferSource();
    breath.buffer = this.noise;
    const bf = this.ctx.createBiquadFilter();
    bf.type = "bandpass";
    bf.frequency.value = freq;
    bf.Q.value = 12;
    const bg = this.ctx.createGain();
    bg.gain.value = 0.08;
    breath.connect(bf);
    bf.connect(bg);
    bg.connect(g);
    o.connect(g);
    g.connect(this.whistleGain);
    const send = this.ctx.createGain();
    send.gain.value = 0.15;
    g.connect(send);
    send.connect(this.reverbSend);
    o.start(t);
    lfo.start(t);
    breath.start(t);
    o.stop(t + dur + 0.1);
    lfo.stop(t + dur + 0.1);
    breath.stop(t + dur + 0.1);
  }

  private bass(t: number, freq: number, _dur: number): void {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    o.type = "sine";
    o.frequency.value = freq;
    f.type = "lowpass";
    f.frequency.value = 380;
    // Punchy pluck — hits hard and disappears, no sustain hum
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(f);
    f.connect(g);
    g.connect(this.bassGain);
    o.start(t);
    o.stop(t + 0.32);
  }

  private shaker(t: number, vel: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 1 + Math.random() * 0.1;
    const f = this.ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 5200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.10 * vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    src.connect(f);
    f.connect(g);
    g.connect(this.percGain);
    src.start(t);
    src.stop(t + 0.1);
  }

  private kick(t: number, vel: number): void {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.11);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.38 * vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g);
    g.connect(this.percGain);
    o.start(t);
    o.stop(t + 0.25);
  }

  private clap(t: number): void {
    for (let i = 0; i < 3; i++) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      const f = this.ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 1500;
      f.Q.value = 0.9;
      const g = this.ctx.createGain();
      const tt = t + i * 0.012;
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.2, tt + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + (i === 2 ? 0.16 : 0.04));
      src.connect(f);
      f.connect(g);
      g.connect(this.percGain);
      const send = this.ctx.createGain();
      send.gain.value = 0.3;
      g.connect(send);
      send.connect(this.reverbSend);
      src.start(tt);
      src.stop(tt + 0.2);
    }
  }
}
