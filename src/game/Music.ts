/**
 * Original procedural score — two instrumentation families, all synthesized
 * in-browser (no copied audio, no samples, no binary assets):
 *
 * 1. ARCADE CHIP (tracks flagged `chip`): bouncy 8-bit-style hooks —
 *    staccato square-wave lead, driving root/octave bass, 2-&-4 backbeat,
 *    150 BPM (170 in fever). The "viral game" sound; front and center.
 * 2. ISLAND FOLK / CINEMATIC (the rest): ukulele strums, glockenspiel
 *    melody, whistled lead, upright-style bass, shaker / kick / clap.
 *
 * Layers respond to game state:
 *   menu  → chip: lead + bass + full arcade kit (a game menu stays alive)
 *           island: uke + sparse glock + bass
 *   play  → + shaker, kick
 *   fever → + clap, whistle lead, brighter, faster
 *   sleep → music-box lullaby
 */
export type MusicMode = "off" | "menu" | "play" | "fever" | "sleep" | "storm";
export type BiomeMusicStyle = "bright" | "warm" | "airy" | "wide" | "night" | "crystal" | "reef" | "ember" | "canyon";

type Voicing = number[];

const BEAT_BPM = 112;
const LOOKAHEAD = 0.16;
const TICK_MS = 25;
/** Hard ceiling on steps scheduled in one timer tick. */
const MAX_STEPS_PER_TICK = 8;
/** How far behind the clock the sequencer may fall before it re-anchors. */
const MAX_LAG = 0.28;

/**
 * Guard against the "machine-gun" failure mode of a lookahead sequencer.
 *
 * Browsers throttle timers in hidden/occluded tabs to >= 1 s. On return, the
 * scheduler's tick loop would otherwise find `nextTime` a whole bar behind the
 * audio clock and schedule every missed step at once — the same instant —
 * which the player hears as the music stuttering or repeating. When the
 * sequencer has fallen further behind than `maxLag`, skip forward instead of
 * replaying the backlog.
 *
 * Exported for unit testing; it is pure.
 */
export function clampSequencerTime(
  nextTime: number,
  now: number,
  maxLag = MAX_LAG,
  reanchor = 0.05,
): number {
  return nextTime < now - maxLag ? now + reanchor : nextTime;
}

// Ukulele GCEA voicings (midi)
const UKE: Record<string, Voicing> = {
  C:  [67, 60, 64, 72],
  G:  [67, 62, 67, 71],
  Am: [69, 60, 64, 69],
  F:  [69, 60, 65, 69],
  Em: [67, 59, 64, 67],
  Dm: [69, 62, 65, 69],
  Gm: [67, 62, 63, 70], // G–D–Eb–Bb, used in PROG_TRON
};

const BASS_ROOT: Record<string, number> = { C: 48, G: 43, Am: 45, F: 41, Em: 40, Dm: 38, Gm: 43 };

const PROG_A = ["C", "G", "Am", "F", "C", "G", "F", "G"];
// PROG_K: Zimmer-style cinematic minor. Am → F → C → G mirrors "Time" / Inception.
const PROG_K = ["Am", "F", "C", "G", "Am", "F", "C", "G"];
const PROG_B = ["Am", "F", "C", "G", "Am", "F", "C", "G"];
const PROG_C = ["F", "G", "Em", "Am", "F", "G", "C", "C"];
const PROG_D = ["Dm", "G", "C", "Am", "F", "G", "C", "G"];
const PROG_E = ["C", "Am", "F", "G", "C", "Am", "F", "G"];
const PROG_F = ["Am", "Em", "F", "C", "Am", "Em", "F", "C"];
const PROG_G = ["C", "G", "Dm", "Am", "C", "G", "Dm", "Am"];
const PROG_H = ["G", "C", "Am", "F", "G", "C", "Am", "F"];
const PROG_I = ["F", "C", "Dm", "G", "F", "C", "Dm", "G"];
const PROG_J = ["Am", "C", "G", "F", "Am", "C", "G", "F"];
// PROG_TRON: Daft Punk / Tron Legacy dark electronic. Am → Dm → Gm → Em — all minor,
// no major relief. Creates the claustrophobic Grid tension.
const PROG_TRON = ["Am", "Dm", "Am", "Em", "Am", "Dm", "Gm", "Em"];

// Melodies: one entry per eighth note (0 = rest, -1 = hold previous)
// All rewritten in Hans Zimmer cinematic architecture: held notes, wide leaps,
// silence as tension, simple motifs that build to a climax.

// Track 1 — Ascent: daybreak fanfare. Single held note, breath, rise to peak.
const MEL_A = [
  72, -1, -1, -1,  0,  0,  0,  0,
  76, -1, -1,  0,  0,  0, 74,  0,
  72, -1, -1, -1,  0,  0,  0,  0,
  69, -1, -1, -1,  0,  0,  0,  0,
  72,  0, 76,  0, 79, -1, -1,  0,
  84, -1, -1, -1, -1, -1,  0,  0,
  81,  0, 79,  0, 76, -1, -1,  0,
  72, -1, -1, -1,  0,  0,  0,  0,
];

// Track 2 — Voyage: dark ocean crossing. Held low, vast silence, single soaring peak.
const MEL_B = [
  69, -1, -1, -1,  0,  0,  0,  0,
   0,  0,  0,  0, 65, -1, -1, -1,
  67, -1, -1,  0,  0,  0,  0,  0,
  72, -1, -1, -1,  0,  0,  0,  0,
  76,  0, 81,  0, 84, -1, -1, -1,
   0,  0,  0,  0,  0,  0,  0,  0,
  81, -1,  0,  0, 76, -1,  0,  0,
  69, -1, -1, -1,  0,  0,  0,  0,
];

// Track 3 — Cathedral: pipe-organ hymn. High held note, descend, full bar silence,
// second phrase reaches a half-step higher — Zimmer's favorite asymmetric repeat.
const MEL_C = [
  81, -1, -1, -1, -1, -1,  0,  0,
  79,  0, 76,  0, 74, -1, -1,  0,
   0,  0,  0,  0, 72, -1, -1, -1,
   0,  0,  0,  0,  0,  0,  0,  0,
  84, -1, -1, -1, -1, -1,  0,  0,
  81,  0, 79,  0, 76, -1, -1,  0,
  74,  0, 72,  0, 69,  0, 67,  0,
  65, -1, -1, -1,  0,  0,  0,  0,
];

// Track 4 — Pendulum: TARS/Interstellar. Violent low-to-high swings, silence, resolve.
const MEL_D = [
  62, -1, -1, -1,  0,  0,  0,  0,
  81, -1, -1,  0,  0,  0,  0,  0,
  65, -1, -1, -1,  0,  0,  0,  0,
  84, -1, -1, -1,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,
  79, -1,  0,  0, 74, -1,  0,  0,
  72, -1, -1,  0, 69, -1, -1,  0,
  67, -1, -1, -1,  0,  0,  0,  0,
];

// Track 5 — The Grid: Tron Legacy pulse. Daft Punk Am arpeggio, stark silence,
// then Zimmer peak. Electronic precision meets orchestral weight.
const MEL_E = [
  69,  0, 72,  0, 76,  0, 79,  0,
  69,  0, 72,  0, 76,  0, 81,  0,
  69, -1,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,
  72,  0, 76,  0, 79,  0, 84,  0,
  84, -1, -1, -1,  0,  0,  0,  0,
  81,  0, 76,  0, 72,  0, 69,  0,
  65, -1, -1, -1,  0,  0,  0,  0,
];

// Track 6 — Eventide: night descends. Single note per bar — maximum space.
// One long held note fills an entire bar; full bar silence = held breath.
const MEL_F = [
  69, -1, -1, -1, -1, -1, -1, -1,
  65, -1, -1, -1,  0,  0,  0,  0,
  67, -1, -1, -1,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,
  72, -1, -1,  0, 76, -1, -1,  0,
  77, -1, -1, -1, -1, -1,  0,  0,
  74,  0, 72,  0, 69, -1, -1,  0,
  65, -1, -1, -1,  0,  0,  0,  0,
];

// Track 7 — Glass & Stars: crystalline echo motif, then stratospheric leap.
// C6 ping echoes → silence → C6 to E6 to G6 — pure Zimmer outer-space texture.
const MEL_G = [
  84, -1,  0,  0, 84, -1,  0,  0,
  81, -1,  0,  0,  0,  0,  0,  0,
  76, -1, -1, -1,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,
  84, -1, -1,  0, 88, -1, -1,  0,
  88, -1, -1, -1,  0,  0,  0,  0,
  84, -1,  0,  0, 79, -1,  0,  0,
  72, -1, -1, -1,  0,  0,  0,  0,
];

// Track 8 — Trade Winds: bold proclamation. G5 statement, silence, rise to C6 peak,
// graceful descent. Modeled on the Inception "Non, je ne regrette rien" fanfare structure.
const MEL_H = [
  79, -1, -1,  0, 76, -1, -1,  0,
  72, -1, -1, -1,  0,  0,  0,  0,
  74,  0, 76,  0, 79, -1, -1, -1,
   0,  0,  0,  0, 72,  0, 69,  0,
  84, -1, -1, -1, -1, -1,  0,  0,
  81,  0, 79,  0, 76,  0, 74,  0,
  72, -1,  0,  0, 69, -1,  0,  0,
  67, -1, -1, -1,  0,  0,  0,  0,
];

// Track 9 — Golden Hour: pure warmth. Every note held long — Zimmer's
// "Interstellar docking scene" philosophy: space IS the music.
const MEL_I = [
  77, -1, -1, -1, -1, -1,  0,  0,
  76, -1, -1,  0,  0,  0,  0,  0,
  74, -1, -1, -1, -1, -1,  0,  0,
  72, -1, -1, -1,  0,  0,  0,  0,
  79, -1, -1, -1, -1, -1,  0,  0,
  76, -1,  0,  0, 74, -1,  0,  0,
  72, -1, -1, -1, -1, -1,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,
];

// Track 10 — Starfall: octave-leap motif — C4 → C6 → back → G5 → A5 → E6 peak.
// Direct Zimmer octave displacement technique from "Cornfield Chase".
const MEL_J = [
  60, -1, -1, -1,  0,  0,  0,  0,
  84, -1, -1, -1,  0,  0,  0,  0,
  60, -1, -1, -1,  0,  0,  0,  0,
  79, -1, -1, -1,  0,  0,  0,  0,
  81, -1,  0,  0, 84, -1,  0,  0,
  88, -1, -1, -1, -1, -1,  0,  0,
  84,  0, 81,  0, 79,  0, 76,  0,
  72, -1, -1, -1,  0,  0,  0,  0,
];

// Track 11 — Derezzed: Tron staccato pulse. Tight paired notes march upward,
// cut to silence, then Daft Punk ascending arp meets Zimmer descent.
const MEL_K = [
  69,  0, 72,  0, 69,  0, 72,  0,
  76,  0, 79,  0, 76,  0, 79,  0,
  81,  0, 84,  0, 81,  0, 84,  0,
  69, -1,  0,  0,  0,  0,  0,  0,
  69,  0, 72,  0, 76,  0, 81,  0,
  84,  0, 81,  0, 76,  0, 72,  0,
  69,  0, 65,  0, 67,  0, 69,  0,
  72, -1, -1, -1,  0,  0,  0,  0,
];

// Track 12 — Magma: tectonic weight. Whole-bar held note, deep drop, full silence,
// slow chromatic crawl upward, then collapse. Zimmer "Earth" / "Interstellar" gravity.
const MEL_L = [
  65, -1, -1, -1, -1, -1, -1, -1,
  62, -1, -1, -1,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,
  60, -1, -1, -1, 62, -1, -1, -1,
  65, -1, -1,  0, 69, -1, -1,  0,
  72, -1, -1, -1,  0,  0,  0,  0,
  70,  0, 69,  0, 67,  0, 65,  0,
  62, -1, -1, -1,  0,  0,  0,  0,
];

// Track 13 — Mesa: canyon vastness. Huge register leaps, long held tones,
// silence as echo — the canyon answers back nothing but wind.
const MEL_M = [
  60, -1, -1, -1,  0,  0,  0,  0,
  84, -1, -1, -1,  0,  0,  0,  0,
  60, -1, -1, -1,  0,  0,  0,  0,
  79, -1, -1, -1,  0,  0,  0,  0,
  62, -1, -1,  0, 81, -1, -1,  0,
  84, -1, -1, -1, -1, -1,  0,  0,
  79,  0, 76,  0, 72,  0, 69,  0,
  65, -1, -1, -1,  0,  0,  0,  0,
];

// Track 14 — Time's Light: Zimmer/Interstellar. High held note → slow descent →
// silent breath → octave-leap ascent to triumphant peak. Epic architecture.
const MEL_N = [
  84, -1, -1, -1,  0,  0, 81, -1,
  -1, -1,  0,  0, 79, -1, -1, -1,
   0,  0,  0,  0, 76, -1, -1,  0,
  72, -1, -1, -1,  0,  0,  0,  0,
  72,  0, 76,  0, 79,  0, 84,  0,
  88, -1, -1, -1, -1, -1,  0,  0,
  84, -1,  0,  0, 81,  0, 79,  0,
  76, -1, -1, -1,  0,  0,  0,  0,
];

// Track 15 — Horizon Chase: Journey/hero theme. Call-and-answer phrases, each
// answer reaching higher, resolving in a noble descending phrase.
const MEL_O = [
  76, -1,  0,  0, 81, -1,  0,  0,
  79,  0, 76,  0, 74, -1,  0,  0,
  72,  0, 74,  0, 76,  0, 79,  0,
  81, -1, -1, -1,  0,  0,  0,  0,
  79, -1,  0,  0, 84, -1,  0,  0,
  86, -1, -1,  0, 84,  0, 81,  0,
  79,  0, 76,  0, 74,  0, 72,  0,
  74, -1, -1, -1,  0,  0,  0,  0,
];

// Track 17 — Inception Drop: Zimmer-style "Braaam" build. Slow minor chords,
// ticking 8ths, then the iconic descending power phrase.
const MEL_Q = [
  69, -1, -1, -1, 69, -1, -1, -1,
  65, -1, -1, -1, 65, -1, -1, -1,
  72, -1,  0,  0, 69, -1,  0,  0,
  67, -1, -1, -1,  0,  0,  0,  0,
  72, 74, 76, 79, 81, 79, 76, 72,
  69, -1, -1,  0, 67,  0, 65,  0,
  64,  0, 67,  0, 69,  0, 72,  0,
  76, -1, -1, -1,  0,  0,  0,  0,
];

// Track 18 — Dunkirk Clock: ticking urgency. Relentless 8th pulse, rising
// chromatic line, sudden silence, then the resolve. Pure Zimmer tension.
const MEL_R = [
  72, 71, 72, 74, 72, 71, 72, 74,
  76, 74, 76, 77, 76, 74, 76, 77,
  79, 77, 79, 81, 79, 77, 79, 81,
  84, -1, -1, -1,  0,  0,  0,  0,
  76, -1,  0,  0, 72, -1,  0,  0,
  69, -1,  0,  0, 67, -1,  0,  0,
  72,  0, 76,  0, 79,  0, 84,  0,
  88, -1, -1, -1,  0,  0,  0,  0,
];

// Track 16 — Fever Dream: Celeste-style driving arpeggio figure.
// 16th-note scalar runs; designed for the fever/chase section.
const MEL_P = [
  72, 74, 76, 79, 81, 79, 76, 74,
  72, 74, 76, 79, 84, 83, 81, 79,
  76, 74, 72, 74, 76, 79, 76, 74,
  72, 71, 72, 74, 76, -1, -1,  0,
  79, 81, 83, 84, 86, 84, 83, 81,
  79, 77, 76, 74, 76, 79, 81, 79,
  77, 76, 74, 72, 74, 76, 79, 76,
  74, -1, 72, -1,  0,  0,  0,  0,
];

// Track 19 — End of Line: Tron Legacy haunting outro. Single notes echo into silence,
// then a four-bar Zimmer swell that never fully resolves — you're still in the Grid.
const MEL_S = [
  69, -1, -1, -1,  0,  0,  0,  0,
   0,  0,  0,  0, 69, -1,  0,  0,
  65, -1, -1, -1,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,
  69,  0, 72,  0, 76, -1, -1, -1,
  79, -1, -1,  0, 76,  0, 74,  0,
  72, -1, -1, -1, -1, -1,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,
];

// Track 20 — Rinzler: Tron's unstoppable enforcer. Driving 8th ostinato mounts
// chromatic pressure to a Zimmer-style eruption, then the cold silence of victory.
const MEL_T = [
  69,  0, 69,  0, 69,  0, 69,  0,
  70,  0, 70,  0, 70,  0, 70,  0,
  71,  0, 71,  0, 72,  0, 72,  0,
  74, -1, -1, -1,  0,  0,  0,  0,
  72,  0, 69,  0, 67,  0, 65,  0,
  64, -1, -1, -1,  0,  0,  0,  0,
  69,  0, 72,  0, 76,  0, 81,  0,
  84, -1, -1, -1,  0,  0,  0,  0,
];

// Whistle counter-melody used in fever (per eighth, section-agnostic)
const WHISTLE = [
  0, 0, 84, 0, 83, 0, 81, 0,
  79, -1, 0, 0, 0, 0, 76, 79,
  81, -1, 0, 0, 79, 0, 76, 0,
  74, -1, -1, 0, 0, 0, 0, 0,
  0, 0, 84, 0, 86, 0, 84, 0,
  83, -1, 0, 0, 79, 0, 0, 0,
  81, 0, 79, 0, 76, 0, 74, 0,
  72, -1, -1, -1, 0, 0, 0, 0,
];

// High-drama fever whistle — wider leaps, more urgent. Used on intense sections.
const WHISTLE_B = [
  0, 0, 88, 0, 86, -1, 0, 0,
  84, 0, 81, 0, 79, 0, 76, 0,
  79, -1, 0, 0, 84, -1, 0, 0,
  86, -1, -1, -1, 0, 0, 0, 0,
  0, 0, 91, 0, 89, -1, 0, 0,
  88, 0, 84, 0, 86, 0, 84, 0,
  81, -1, 0, 0, 79, 0, 76, 0,
  77, -1, -1, -1, 0, 0, 0, 0,
];

// Strum pattern per eighth: 1 = down, 2 = up, 0 = none (island strum D _ D U _ U D U)
const STRUM = [1, 0, 1, 2, 0, 2, 1, 2];

export type Track = { name: string; prog: string[]; mel: number[]; mood: BiomeMusicStyle; /** Arcade chiptune family: square lead, driving 8th bass, backbeat, fast tempo. */ chip?: boolean };

/* ============================ ARCADE CHIP FAMILY =========================
 * Bouncy, hook-first 8-bit-style bangers — the "viral game" sound:
 * staccato square-wave leads over driving root/octave bass on a 2-&-4
 * backbeat. Each is a tight 8-bar loop built on a 2-bar motif with
 * variation, so the ear locks on in one pass. */

const PROG_CHIP_1 = ["C", "G", "Am", "F", "C", "G", "Am", "F"]; // I–V–vi–IV
const PROG_CHIP_2 = ["C", "F", "G", "F", "C", "F", "G", "G"];  // I–IV–V–IV
const PROG_CHIP_3 = ["C", "Am", "F", "G", "C", "Am", "F", "G"]; // I–vi–IV–V
const PROG_CHIP_5 = ["C", "F", "Am", "G", "C", "F", "Am", "G"]; // I–IV–vi–V
const PROG_CHIP_6 = ["Dm", "G", "C", "F", "Dm", "G", "C", "F"]; // ii–V–I–IV

// Flappy Rush: staccato rising arp → peak hold → falling resolve. The bounce
// of a coin-tap game: C5–E5–G5–C6 on the downbeat of bar 1.
const MEL_CHIP_1 = [
  72, 0, 72, 0, 76, 0, 79, 0,
  79, 0, 79, 0, 84, 0, 83, 0,
  81, 0, 81, 0, 79, 0, 76, 0,
  79, 0, 81, 0, 84, -1, 0, 0,
  72, 0, 76, 0, 79, 0, 84, -1,
  84, 0, 83, 0, 79, 0, 79, 0,
  81, 0, 79, 0, 76, 0, 79, 0,
  76, 0, 74, 0, 72, -1, -1, 0,
];

// Coin Pop: paired-note "coin" figure (C5–C5–G5–C6) that repeats a step
// higher each bar — the most repeatable hook in the box.
const MEL_CHIP_2 = [
  72, 0, 72, 79, 0, 79, 84, 0,
  72, 0, 72, 76, 0, 76, 81, 0,
  74, 0, 74, 79, 0, 79, 84, 0,
  76, 0, 76, 81, 0, 81, 79, 0,
  79, 0, 84, 0, 84, 0, 86, 0,
  81, 0, 84, 0, 84, 0, 81, 0,
  84, 0, 84, 83, 0, 83, 79, 0,
  81, 0, 79, 0, 76, -1, -1, 0,
];

// Hyper Glide: three-note pickup gallop (E5–E5–G5) that climbs bar by bar
// and lands on a held peak — pure forward motion.
const MEL_CHIP_3 = [
  76, 0, 0, 76, 0, 0, 79, 0,
  81, 0, 0, 81, 0, 0, 84, 0,
  79, 0, 0, 79, 0, 0, 76, 0,
  79, 0, 0, 79, 0, 0, 74, 0,
  76, 0, 0, 79, 0, 0, 84, -1,
  81, 0, 0, 79, 0, 0, 81, -1,
  84, 0, 0, 81, 0, 0, 79, -1,
  79, 0, 0, 74, 0, 0, 79, -1,
];

// Bouncy Bird: two-two gallop (A5–A5–G5–E5) over the vi–IV–I–V lift —
// the "run for your life" footwork.
const MEL_CHIP_4 = [
  81, 81, 0, 79, 0, 0, 76, 76,
  76, 76, 0, 74, 0, 0, 72, 72,
  72, 72, 0, 76, 0, 0, 79, 79,
  79, 79, 0, 84, 0, 0, 83, 83,
  81, 81, 0, 84, 0, 0, 81, 81,
  79, 79, 0, 76, 0, 0, 74, 74,
  72, 72, 0, 76, 0, 0, 79, 79,
  79, 0, 0, 79, 0, 0, 79, -1,
];

// Sunset Sprint: syncopated quarter-note pop (C5–E5–G5–A5) with a held
// peak each second phrase — upbeat arcade-pop.
const MEL_CHIP_5 = [
  72, 0, 76, 76, 0, 79, 0, 81,
  79, 0, 76, 76, 0, 81, 0, 84,
  81, 0, 79, 79, 0, 81, 0, 84,
  84, 0, 83, 83, 0, 79, 0, 79,
  76, 0, 79, 79, 0, 84, 0, 84,
  84, 0, 81, 81, 0, 79, 0, 76,
  79, 0, 76, 76, 0, 79, 0, 81,
  79, 0, 74, 74, 0, 79, -1, 0,
];

// Pixel Coast: offbeat syncopation (0–D5–0–F5–F5–A5) over ii–V–I–IV —
// the grooviest one in the box; the night-arcade track.
const MEL_CHIP_6 = [
  0, 74, 0, 76, 77, 0, 81, 0,
  0, 79, 0, 84, 83, 0, 79, 0,
  0, 72, 0, 76, 79, 0, 84, 0,
  0, 77, 0, 81, 84, 0, 79, 0,
  0, 74, 0, 76, 79, 0, 81, -1,
  0, 79, 0, 83, 84, 0, 81, 0,
  0, 72, 0, 79, 84, -1, 0, 0,
  0, 77, 0, 79, 81, -1, -1, 0,
];

/**
 * Track list. The arcade chiptune family comes FIRST so it sits at the top
 * of the settings picker and early in every shuffle pass; the island-folk /
 * cinematic originals follow unchanged.
 */
export const TRACKS: Track[] = [
  { name: "Flappy Rush",     prog: PROG_CHIP_1, mel: MEL_CHIP_1, mood: "bright", chip: true },
  { name: "Coin Pop",        prog: PROG_CHIP_2, mel: MEL_CHIP_2, mood: "bright", chip: true },
  { name: "Hyper Glide",     prog: PROG_CHIP_3, mel: MEL_CHIP_3, mood: "airy",   chip: true },
  { name: "Bouncy Bird",     prog: PROG_K,      mel: MEL_CHIP_4, mood: "warm",   chip: true },
  { name: "Sunset Sprint",   prog: PROG_CHIP_5, mel: MEL_CHIP_5, mood: "wide",   chip: true },
  { name: "Pixel Coast",     prog: PROG_CHIP_6, mel: MEL_CHIP_6, mood: "night",  chip: true },
  { name: "Ascent",            prog: PROG_A, mel: MEL_A, mood: "bright"  },
  { name: "Voyage",            prog: PROG_B, mel: MEL_B, mood: "airy"    },
  { name: "Cathedral",         prog: PROG_C, mel: MEL_C, mood: "bright"  },
  { name: "Pendulum",          prog: PROG_D, mel: MEL_D, mood: "wide"    },
  { name: "The Grid",          prog: PROG_TRON, mel: MEL_E, mood: "night" },
  { name: "Eventide",          prog: PROG_F, mel: MEL_F, mood: "night"   },
  { name: "Glass & Stars",     prog: PROG_G, mel: MEL_G, mood: "crystal" },
  { name: "Trade Winds",       prog: PROG_H, mel: MEL_H, mood: "wide"    },
  { name: "Golden Hour",       prog: PROG_I, mel: MEL_I, mood: "warm"    },
  { name: "Starfall",          prog: PROG_J, mel: MEL_J, mood: "night"   },
  { name: "Derezzed",          prog: PROG_TRON, mel: MEL_K, mood: "ember" },
  { name: "Magma",             prog: PROG_F, mel: MEL_L, mood: "ember"   },
  { name: "Mesa",              prog: PROG_I, mel: MEL_M, mood: "canyon"  },
  { name: "Time's Light",      prog: PROG_K, mel: MEL_N, mood: "wide"    },
  { name: "Horizon Chase",     prog: PROG_H, mel: MEL_O, mood: "bright"  },
  { name: "Fever Dream",       prog: PROG_E, mel: MEL_P, mood: "reef"    },
  { name: "Inception Drop",    prog: PROG_K, mel: MEL_Q, mood: "night"   },
  { name: "Dunkirk Clock",     prog: PROG_J, mel: MEL_R, mood: "ember"   },
  { name: "End of Line",       prog: PROG_TRON, mel: MEL_S, mood: "night" },
  { name: "Rinzler",           prog: PROG_TRON, mel: MEL_T, mood: "ember" },
];

/** Track titles for the settings picker — keep in lockstep with TRACKS. */
export const TRACK_NAMES: string[] = TRACKS.map((t) => t.name);

// Per-biome orchestration keeps each island sonically distinct while all
// variants share the same original melodic identity.
const BIOME_MIX: Record<BiomeMusicStyle, { bpm: number; fever: number; cutoff: number; uke: number; glock: number; bass: number; perc: number; whistle: number; transpose: number }> = {
  // fever BPMs bumped +6 for maximum urgency (old max was +14, now up to +20)
  bright:  { bpm: 112, fever: 132, cutoff: 9000,  uke: 0.9,  glock: 1.2,  bass: 1,    perc: 1,    whistle: 1.1,  transpose: 0  },
  warm:    { bpm: 106, fever: 128, cutoff: 6200,  uke: 1.1,  glock: 0.95, bass: 1.12, perc: 0.9,  whistle: 0.95, transpose: -2 },
  airy:    { bpm: 116, fever: 136, cutoff: 9800,  uke: 0.8,  glock: 1.35, bass: 0.9,  perc: 1.15, whistle: 1.15, transpose: 2  },
  wide:    { bpm: 110, fever: 130, cutoff: 7500,  uke: 0.8,  glock: 1.05, bass: 1.22, perc: 0.95, whistle: 1.15, transpose: -3 },
  night:   { bpm: 104, fever: 126, cutoff: 4600,  uke: 0.62, glock: 1.45, bass: 0.82, perc: 0.65, whistle: 0.88, transpose: -5 },
  crystal: { bpm: 114, fever: 134, cutoff: 10500, uke: 0.72, glock: 1.55, bass: 0.92, perc: 1.04, whistle: 1.3,  transpose: 4  },
  // Coral Reach: flowing, liquid — brighter glock sparkle, open high end
  reef:    { bpm: 118, fever: 138, cutoff: 11200, uke: 0.75, glock: 1.45, bass: 0.86, perc: 0.88, whistle: 1.2,  transpose: 3  },
  // Cinder Forge: tense, volcanic — heavy bass, muted highs, dark register
  ember:   { bpm: 100, fever: 122, cutoff: 3800,  uke: 0.68, glock: 0.88, bass: 1.38, perc: 1.12, whistle: 0.65, transpose: -7 },
  // Skyreach Canyon: dry, cavernous — sparse whistle, deep bass, wide dynamics
  canyon:  { bpm: 108, fever: 128, cutoff: 7000,  uke: 0.75, glock: 0.98, bass: 1.28, perc: 0.78, whistle: 1.22, transpose: -4 },
};

/** Keep every biome/night combination inside WebAudio's usable filter range. */
export function musicCutoff(base: number, night: number, intensity: number, sampleRate = 44100): number {
  return Math.max(700, Math.min(sampleRate * 0.45, base - night * 4200 + intensity * 2400));
}

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
  /** Which tracks to play: "shuffle" cycles all ten in random order, or a
   *  number pins one track. Mirrors the persisted settings value. */
  private trackSel: number | "shuffle" = "shuffle";
  private order: number[] = [];
  private orderPos = 0;
  /** Fired whenever the engine advances to a new track, with its title. */
  onTrackChange: ((name: string) => void) | null = null;
  private bpm = BEAT_BPM;
  private night = 0;
  private biome: BiomeMusicStyle = "bright";
  private transpose = 0;
  private lastCutoff = 9000;
  /** 0..1 — continuous intensity (speed / altitude / fever / danger / combos). */
  private intensity = 0;
  private intensityTarget = 0;

  private readonly bus: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly duckGain: GainNode;
  private readonly wetGain: GainNode;
  private readonly ukeGain: GainNode;
  private readonly glockGain: GainNode;
  private readonly bassGain: GainNode;
  private readonly percGain: GainNode;
  private readonly whistleGain: GainNode;
  private readonly padGain: GainNode;
  private readonly lullabyGain: GainNode;
  private readonly tensionGain: GainNode;
  private readonly arpGain: GainNode;
  private readonly organGain: GainNode;
  private readonly tronGain: GainNode;
  private readonly chipGain: GainNode;
  private readonly noise: AudioBuffer;
  private lullabyStep = 0;
  private baseLevel = 0;
  private isTronTrack = false;
  private isChipTrack = false;
  private viralGlissandoTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    reverbSend: AudioNode,
  ) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    // Master compressor: glues the mix, adds cinematic punch and loudness
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 9000;
    this.filter.Q.value = 0.4;
    this.duckGain = ctx.createGain();
    this.duckGain.gain.value = 1;
    this.bus.connect(this.filter);
    this.filter.connect(comp);
    comp.connect(this.duckGain);
    this.duckGain.connect(destination);
    // Post-fader send: music volume, mode and event ducking control the wet
    // signal too. Per-note sends used to bypass all three (even at volume 0).
    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0.22;
    this.duckGain.connect(this.wetGain);
    this.wetGain.connect(reverbSend);

    const mk = (v: number): GainNode => {
      const g = ctx.createGain();
      g.gain.value = v;
      g.connect(this.bus);
      return g;
    };
    this.ukeGain = mk(0.30);
    this.glockGain = mk(0.38);
    this.bassGain = mk(0.44);
    this.percGain = mk(0);
    this.whistleGain = mk(0);
    this.padGain = mk(0);
    this.lullabyGain = mk(0);
    this.tensionGain = mk(0);
    this.arpGain = mk(0);
    this.organGain = mk(0);
    this.tronGain = mk(0);
    this.chipGain = mk(0);

    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.buildOrder();
    this.section = this.order[0] ?? 0;
    this.syncFamilyFlags();
  }

  setMode(mode: MusicMode): void {
    if (mode === this.targetMode) return;
    this.targetMode = mode;
    this.apply();
  }

  setNight(t: number): void {
    this.night = Math.max(0, Math.min(1, t));
    this.recomputeCutoff(0.6);
  }

  /** Continuous intensity — opens the filter, speeds up tempo, and adds a tension hat layer. */
  setIntensity(v: number): void {
    const t = Math.max(0, Math.min(1, v));
    if (Math.abs(t - this.intensityTarget) < 0.01) return;
    this.intensityTarget = t;
    const now = this.ctx.currentTime;
    // The tension layer rides up quickly for responsiveness, decays a touch
    // slower so a big moment lingers after the peak.
    const style = BIOME_MIX[this.biome];
    // Arcade tracks hold their own tempo floor; intensity adds the same 10%
    // surge on top for island tracks.
    const baseBpm = this.isChipTrack
      ? (this.mode === "fever" ? 170 : 150)
      : (this.mode === "fever" ? style.fever : style.bpm);
    this.bpm = Math.round(baseBpm * (1 + t * 0.10));
    this.tensionGain.gain.setTargetAtTime(t * 0.24 * style.perc, now, t > this.intensity ? 0.1 : 0.4);
    this.recomputeCutoff(0.3);
  }

  /** Sidechain compressor pumping effect for viral EDM rhythm bounce. */
  sidechainPump(duckAmount = 0.35, duration = 0.12): void {
    if (this.baseLevel <= 0) return;
    const t = this.ctx.currentTime;
    this.duckGain.gain.cancelScheduledValues(t);
    this.duckGain.gain.setValueAtTime(1 - duckAmount, t);
    this.duckGain.gain.exponentialRampToValueAtTime(1, t + duration);
  }

  /** Viral beat drop & sub-bass impact for high combo launches and fever triggers. */
  triggerBeatDrop(intensityMult = 1.0): void {
    if (this.baseLevel <= 0) return;
    const t = this.ctx.currentTime;
    // 1. Sub-bass drop sweep
    const sub = this.ctx.createOscillator();
    const subG = this.ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(130 * intensityMult, t);
    sub.frequency.exponentialRampToValueAtTime(28, t + 0.5);
    subG.gain.setValueAtTime(0.0001, t);
    subG.gain.exponentialRampToValueAtTime(0.65, t + 0.008);
    subG.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    sub.connect(subG);
    subG.connect(this.bus);
    sub.start(t);
    sub.stop(t + 0.6);

    // 2. Rhythmic sidechain pump
    this.sidechainPump(0.45, 0.22);
  }

  /** Viral pitch glissando / star-power glide during boost or fever onset. */
  triggerViralGlissando(): void {
    if (this.viralGlissandoTimer !== null) clearTimeout(this.viralGlissandoTimer);
    const originalTranspose = this.transpose;
    this.transpose += 2;
    this.viralGlissandoTimer = setTimeout(() => {
      this.transpose = originalTranspose;
      this.viralGlissandoTimer = null;
    }, 1400);
  }

  private recomputeCutoff(ramp: number): void {
    const cutoff = musicCutoff(BIOME_MIX[this.biome].cutoff, this.night, this.intensityTarget, this.ctx.sampleRate);
    if (Math.abs(cutoff - this.lastCutoff) < 12) return;
    this.lastCutoff = cutoff;
    this.filter.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, ramp);
  }

  setLevel(level: number): void {
    this.baseLevel = level;
    this.apply();
  }

  setBiome(style: BiomeMusicStyle): void {
    if (style === this.biome) return;
    this.biome = style;
    this.apply();
  }

  /** Pin a single track (0..TRACK_NAMES.length-1) or "shuffle" to cycle all. */
  setTrack(sel: number | "shuffle"): void {
    this.trackSel = sel;
    this.buildOrder();
    this.orderPos = 0;
    this.section = this.order[0] ?? 0;
    this.syncFamilyFlags();
    // If we're sounding, re-apply immediately: a fresh family (island ↔ chip
    // ↔ tron) must change gains and tempo NOW, not at the next section flip.
    if (this.timer !== null) this.apply();
    if (this.timer !== null) this.onTrackChange?.(TRACKS[this.section]!.name);
  }

  get trackName(): string {
    return TRACKS[this.section]?.name ?? "";
  }

  /** Re-derive the instrumentation family flags from the current section. */
  private syncFamilyFlags(): void {
    const sec = TRACKS[this.section]!;
    const nowTron = sec.prog === PROG_TRON;
    const nowChip = sec.chip === true;
    this.isTronTrack = nowTron;
    this.isChipTrack = nowChip;
  }

  private buildOrder(): void {
    if (this.trackSel === "shuffle") {
      // Weighted draw without replacement: tracks whose mood matches the
      // current biome come up sooner, nightfall favors night tracks and
      // suppresses bright ones — but every track still plays each pass.
      const pool = Array.from({ length: TRACKS.length }, (_, i) => i);
      this.order = [];
      while (pool.length) {
        const weights = pool.map((i) => this.trackWeight(i));
        const total = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * total;
        let pick = 0;
        for (let i = 0; i < pool.length; i++) {
          r -= weights[i]!;
          if (r <= 0) {
            pick = i;
            break;
          }
        }
        this.order.push(pool[pick]!);
        pool.splice(pick, 1);
      }
      // Avoid opening on the track we just finished.
      if (this.order.length > 1 && this.order[0] === this.section) {
        const tmp = this.order[0]!;
        this.order[0] = this.order[1]!;
        this.order[1] = tmp;
      }
    } else {
      this.order = [this.trackSel];
    }
  }

  /** Sampling weight for a track given the current biome and time of day. */
  private trackWeight(index: number): number {
    const track = TRACKS[index]!;
    const mood = track.mood;
    // Arcade chiptune bangers are the default front line: weighted above the
    // island-folk tracks so shuffle mode opens on them, but below a perfect
    // biome match so the authored island tracks still surface.
    if (track.chip) {
      if (mood === this.biome) return 3.2;
      if (this.night > 0.6 && mood === "night") return 3.0; // Pixel Coast at night
      return 2.6;
    }
    if (mood === this.biome) return 3; // authored for this island
    if (this.night > 0.6) {
      if (mood === "night") return 2.5; // nightfall pulls toward the moon tracks
      if (mood === "bright" || mood === "airy") return 0.35; // and away from sun
    }
    return 1;
  }

  duck(amount = 0.45, release = 0.5): void {
    const t = this.ctx.currentTime;
    this.duckGain.gain.cancelScheduledValues(t);
    this.duckGain.gain.setTargetAtTime(1 - amount, t, 0.02);
    this.duckGain.gain.setTargetAtTime(1, t + 0.12, release);
  }

  dispose(): void {
    if (this.viralGlissandoTimer !== null) {
      clearTimeout(this.viralGlissandoTimer);
      this.viralGlissandoTimer = null;
    }
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.bus.disconnect();
    this.filter.disconnect();
    this.duckGain.disconnect();
    this.wetGain.disconnect();
    this.tronGain.disconnect();
    this.chipGain.disconnect();
  }

  private apply(): void {
    const t = this.ctx.currentTime;
    const m = this.targetMode;
    const on = this.baseLevel > 0 && m !== "off";
    this.bus.gain.setTargetAtTime(on ? this.baseLevel : 0, t, 0.5);

    const style = BIOME_MIX[this.biome];
    this.transpose = style.transpose;
    const song = m === "menu" || m === "play" || m === "fever" || m === "storm";
    // Arcade tracks run their own faster tempo; everything else follows the biome.
    const chipBpm = this.isChipTrack ? (m === "fever" ? 170 : 150) : (m === "fever" ? style.fever : style.bpm);
    // Fever: glock leads more prominently (it's the hook the ear remembers).
    // Island layers stay silent on arcade tracks — square lead + chip bass own the mix.
    const island = this.isChipTrack ? 0 : 1;
    this.ukeGain.gain.setTargetAtTime(song ? (m === "menu" ? 0.28 : m === "fever" ? 0.26 : 0.32) * style.uke * island : 0, t, 0.4);
    this.glockGain.gain.setTargetAtTime(song ? (m === "menu" ? 0.22 : m === "fever" ? 0.38 : 0.30) * style.glock * island : 0, t, 0.4);
    this.bassGain.gain.setTargetAtTime(song ? (m === "fever" ? 0.48 : 0.42) * style.bass : 0, t, 0.4);
    // Arcade kits keep the drums alive on the menu too — that's what makes it
    // feel like a game menu instead of a lobby.
    const percBase = m === "play" ? 0.22 : m === "fever" ? 0.36 : m === "storm" ? 0.46 : this.isChipTrack && m === "menu" ? 0.30 : 0;
    this.percGain.gain.setTargetAtTime(percBase * style.perc, t, 0.3);
    this.whistleGain.gain.setTargetAtTime((m === "fever" ? 0.30 : 0) * style.whistle * island, t, 0.3);
    this.arpGain.gain.setTargetAtTime(m === "fever" ? 0.18 * style.glock * island : 0, t, 0.5);
    // Organ: Interstellar-style deep pad. Swells in play and fever.
    this.organGain.gain.setTargetAtTime((m === "play" ? 0.10 : m === "fever" ? 0.18 : m === "menu" ? 0.06 : 0) * island, t, 1.2);
    // Warm pad bed: strongest on the menu, subtle underneath play.
    this.padGain.gain.setTargetAtTime((m === "menu" ? 0.18 : m === "play" ? 0.06 : 0) * island, t, 0.8);
    // Tron synth: active only on Tron-progression tracks (replaces glock lead)
    this.tronGain.gain.setTargetAtTime(this.isTronTrack && song ? (m === "fever" ? 0.36 : 0.28) : 0, t, 0.4);
    // Arcade chiptune lead: the hook voice, present even on the menu.
    this.chipGain.gain.setTargetAtTime(this.isChipTrack && song ? (m === "menu" ? 0.26 : m === "fever" ? 0.40 : 0.32) : 0, t, 0.4);
    this.lullabyGain.gain.setTargetAtTime(m === "sleep" ? 0.3 : 0, t, 0.6);
    const cutoff = musicCutoff(style.cutoff, this.night, this.intensityTarget, this.ctx.sampleRate);
    this.filter.frequency.setTargetAtTime(cutoff, t, 0.55);
    this.lastCutoff = cutoff;
    this.bpm = chipBpm;

    this.mode = m;
    if (on && this.timer === null) this.start();
    if (!on && this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private start(): void {
    if (this.timer !== null) return;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.step = 0;
    this.bar = 0;
    this.buildOrder();
    this.orderPos = 0;
    this.section = this.order[0] ?? 0;
    this.syncFamilyFlags();
    this.lullabyStep = 0;
    if (this.mode !== "sleep") this.onTrackChange?.(TRACKS[this.section]!.name);
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  private tick(): void {
    if (this.ctx.state !== "running") return;
    // Smooth the intensity so the hat layer swells instead of stuttering.
    this.intensity += (this.intensityTarget - this.intensity) * 0.12;
    const now = this.ctx.currentTime;
    // If the timer was throttled (background tab, occluded window, locked
    // phone) the sequencer will be far behind. Re-anchor so we skip the missed
    // music rather than dumping the whole backlog onto the audio clock at once.
    this.nextTime = clampSequencerTime(this.nextTime, now);
    let scheduled = 0;
    while (this.nextTime < now + LOOKAHEAD && scheduled < MAX_STEPS_PER_TICK) {
      // Never hand Web Audio a timestamp in the past: it plays immediately, so
      // every missed step would stack into one percussive burst.
      const t = Math.max(this.nextTime, now + 0.001);
      if (this.mode === "sleep") this.scheduleLullaby(t);
      else this.scheduleStep(t);
      this.advance();
      scheduled++;
    }
  }

  private advance(): void {
    const beat = 60 / this.bpm;
    const swing = this.mode === "sleep" ? 0.5 : 0.56;
    const dur = this.step % 2 === 0 ? beat * swing : beat * (1 - swing);
    this.nextTime += this.mode === "sleep" ? beat * 0.75 : dur;
    this.step += 1;
    if (this.step >= 8) {
      this.step = 0;
      this.bar += 1;
      if (this.bar >= 8) {
        this.bar = 0;
        this.orderPos = (this.orderPos + 1) % this.order.length;
        // Reshuffle when a full shuffle cycle completes, so no two passes
        // repeat the same sequence.
        if (this.orderPos === 0 && this.trackSel === "shuffle") this.buildOrder();
        this.section = this.order[this.orderPos]!;
        // Update the instrumentation family when the section changes; only
        // adjust gains if the family (island / tron / chip) actually flipped.
        const wasTron = this.isTronTrack;
        const wasChip = this.isChipTrack;
        this.syncFamilyFlags();
        if (wasTron !== this.isTronTrack || wasChip !== this.isChipTrack) {
          this.apply();
        }
        // Sleep mode plays the lullaby, not the track — don't announce a
        // "now playing" title for music the player can't hear.
        if (this.mode !== "sleep") this.onTrackChange?.(TRACKS[this.section]!.name);
      }
    }
  }

  private scheduleStep(t: number): void {
    // Storm mode pulls the whole song down a minor third — same melody,
    // completely different weather.
    const stormShift = this.mode === "storm" ? -3 : 0;
    const sec = TRACKS[this.section]!;
    const chordName = sec.prog[this.bar]!;
    const chord = UKE[chordName]!;
    const idx = this.bar * 8 + this.step;
    const beat = 60 / this.bpm;

    // Chord pad: ensemble strings swell once per bar (island tracks only)
    if (!this.isChipTrack && this.step === 0 && (this.mode === "menu" || this.mode === "play")) this.pad(t, chordName, beat * 4);

    // Menu-only birdsong: an occasional far-away sparkle chirp
    if (!this.isChipTrack && this.mode === "menu" && this.step === 6 && Math.random() < 0.3) {
      this.birdsong(t + Math.random() * beat * 0.5);
    }

    // Chord strum (island tracks) or Tron chord pulse
    const strum = STRUM[this.step]!;
    if (strum && !this.isTronTrack && !this.isChipTrack) {
      const accent = this.step === 0 ? 1 : this.step === 4 ? 0.85 : 0.65;
      const order = strum === 1 ? chord : [...chord].reverse();
      order.forEach((m, i) => this.pluck(t + i * 0.011 + Math.random() * 0.004, mtof(m + this.transpose + stormShift), accent * (0.7 + 0.3 * Math.random())));
    } else if (strum && this.isTronTrack && this.step === 0) {
      // Tron: staccato chord stab on beat 1 only
      chord.forEach((m) => this.tronStab(t, mtof(m + this.transpose + stormShift), beat * 0.18));
    }

    // Bass: island = root on 1, fifth or root on 3, occasional walk-up on 8;
    // arcade = relentless root/octave pump on every eighth — the 8-bit drive.
    if (this.isChipTrack) {
      const root = mtof(BASS_ROOT[chordName]! + this.transpose + stormShift);
      const oct = mtof(BASS_ROOT[chordName]! + 12 + this.transpose + stormShift);
      if (this.step % 2 === 0) this.chipBass(t, root, beat * 0.42, this.step === 0 ? 1 : 0.85);
      else this.chipBass(t, oct, beat * 0.26, 0.55);
    } else {
      if (this.step === 0) this.bass(t, mtof(BASS_ROOT[chordName]! + this.transpose + stormShift), beat * 0.9);
      if (this.step === 4) this.bass(t, mtof(BASS_ROOT[chordName]! + (this.bar % 2 ? 7 : 0) + this.transpose + stormShift), beat * 0.8);
      if (this.step === 7 && this.bar % 4 === 3) this.bass(t, mtof(BASS_ROOT[chordName]! + 5 + this.transpose + stormShift), beat * 0.4);
    }

    // Melody: FM bell/piano on island tracks, Tron lead on Tron tracks,
    // staccato square-wave chiptune lead on arcade tracks (always present —
    // a game menu should never sound half-asleep).
    const note = sec.mel[idx] ?? 0;
    if (note > 0) {
      const sparse = !this.isChipTrack && this.mode === "menu" && this.step % 2 === 1 && Math.random() < 0.5;
      if (!sparse) {
        const noteFreq = mtof(note + this.transpose + stormShift);
        const vel = this.step === 0 ? 1 : 0.8;
        if (this.isTronTrack) {
          this.tronLead(t, noteFreq, beat * 0.85, vel);
        } else if (this.isChipTrack) {
          let len = 1;
          while ((sec.mel[idx + len] ?? 0) === -1) len++;
          this.chipLead(t, noteFreq, Math.min(beat * 0.24 * len, beat * 0.9), vel);
        } else {
          this.glock(t, noteFreq, vel);
        }
      }
    }

    // Percussion
    if (this.isChipTrack) {
      // Arcade kit: 2-&-4 backbeat, driving 8th hats, present on the menu too.
      const light = this.mode === "menu" ? 0.75 : 1;
      this.hat(t, (this.step % 2 === 0 ? 0.2 : 0.14) * light, 7800);
      if (this.step === 0 || this.step === 4) {
        this.kick(t, (this.step === 0 ? 1 : 0.85) * light);
        if (this.mode === "fever" || this.intensity > 0.5) this.sidechainPump(0.22 + this.intensity * 0.18, 0.11);
      }
      if (this.step === 2 || this.step === 6) {
        this.snare(t, (this.mode === "fever" ? 0.9 : 0.68) * light);
        if (this.mode === "fever") this.clap(t);
      }
      // Momentum: ghost kick into the downbeat once a run is underway.
      if ((this.mode === "play" || this.mode === "fever" || this.mode === "storm") && this.step === 7) this.kick(t, 0.58 * light);
      if (this.mode === "storm" && (this.step === 2 || this.step === 6)) this.kick(t, 0.5 * light);
      if (this.mode === "fever" && this.step === 3) this.hat(t, 0.22 * light, 5200);
    } else if (this.mode === "play" || this.mode === "fever" || this.mode === "storm") {
      // Leave breathing space in normal flight; fever earns the busy groove.
      if (this.mode !== "play" || this.step % 2 === 0 || this.intensity > 0.65) {
        this.shaker(t, this.step % 2 === 0 ? 0.48 : 0.24);
      }
      if (this.step === 0 || this.step === 4) {
        this.kick(t, this.step === 0 ? 1 : 0.82);
        if (this.mode === "fever" || this.intensity > 0.5) {
          this.sidechainPump(0.20 + this.intensity * 0.18, 0.11);
        }
      }
      // Snare on 2&4 (steps 2 and 6) in fever — the heartbeat that locks the groove.
      if (this.mode === "fever" && (this.step === 2 || this.step === 6)) {
        this.clap(t);
        this.snare(t, 0.9);
      }
      // Open hi-hat on the "and" of 2 in fever (step 3) — the sizzle between beats.
      if (this.mode === "fever" && this.step === 3) this.hat(t, 0.22, 5000);
      // Snare accent in high-intensity play (not full fever yet — building tension).
      if (this.mode === "play" && this.intensity > 0.7 && (this.step === 2 || this.step === 6)) {
        this.snare(t, 0.4 + this.intensity * 0.3);
      }
      // Storm: relentless — kicks on every other eighth, like weather that won't quit.
      if (this.mode === "storm" && (this.step === 2 || this.step === 6)) this.kick(t, 0.58);
      if (this.step === 7 && this.bar % 2 === 1) this.shaker(t + beat * 0.22, 0.42);

      // Tension layer: offbeat hats that swell with intensity (SSX-style adaptive).
      if (this.intensity > 0.05 && this.step % 2 === 1) {
        this.hat(t, 0.1 + this.intensity * 0.28, 6400 + this.intensity * 2600);
      }
      if (this.mode === "fever" && this.intensity > 0.6 && (this.step === 2 || this.step === 6)) {
        this.hat(t + beat * 0.5, 0.08 + (this.intensity - 0.6) * 0.3, 8400);
      }
    }

    // Organ: Interstellar-style deep swell on bar starts in play/fever.
    if (!this.isChipTrack && (this.mode === "play" || this.mode === "fever") && this.step === 0 && this.bar % 2 === 0) {
      this.organ(t, chordName, beat * 8);
    }

    // Arp bursts in fever — Celeste-style fills on offbeats between melody notes.
    if (!this.isChipTrack && this.mode === "fever" && (this.step === 1 || this.step === 5) && this.intensity > 0.3) {
      const arpNote = (UKE[chordName]?.[1] ?? 60) + 24 + this.transpose + stormShift;
      this.arp(t, mtof(arpNote), beat * 0.9);
    }

    // Whistle (fever) — alternate between WHISTLE and WHISTLE_B each 4-bar phrase.
    if (!this.isChipTrack && this.mode === "fever") {
      const whistleSrc = this.bar < 4 ? WHISTLE : WHISTLE_B;
      const w = whistleSrc[idx] ?? 0;
      if (w > 0) {
        let len = 1;
        while ((whistleSrc[idx + len] ?? 0) === -1) len++;
        this.whistle(t, mtof(w + this.transpose), beat * 0.5 * len * 0.95);
      }
    }
  }

  private scheduleLullaby(t: number): void {
    const arp = [60, 64, 67, 71, 72, 71, 67, 64];
    const m = arp[this.lullabyStep % arp.length]!;
    this.lullabyStep += 1;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.value = mtof(m + 12 + this.transpose);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(g);
    g.connect(this.lullabyGain);

    o.start(t);
    o.stop(t + 1.5);
  }

  /* ---------- instruments ---------- */

  /** Ensemble strings: 7 detuned sawtooth oscillators per chord note — the
   *  same algorithm all hardware string synthesizers use. Slow attack (0.5s)
   *  creates the characteristic swell; wide chorus detune = lushness. */
  private pad(t: number, chordName: string, dur: number): void {
    const root = (BASS_ROOT[chordName] ?? 48) + 12 + this.transpose;
    const notes = [root, root + 7, root + 12];
    const detunes = [-14, -8, -3, 0, 3, 8, 14]; // 7 oscillators = chorus ensemble
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + dur * 0.45); // slow string attack
    g.gain.setValueAtTime(0.28, t + dur * 0.78);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.08);
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 2200; // let harmonics through — real string quality
    f.Q.value = 0.3;
    g.connect(f);
    f.connect(this.padGain);
    for (const m of notes) {
      for (const det of detunes) {
        const o = this.ctx.createOscillator();
        const og = this.ctx.createGain();
        o.type = "sawtooth";
        o.frequency.value = mtof(m) * Math.pow(2, det / 1200);
        og.gain.value = 0.11 / detunes.length;
        o.connect(og);
        og.connect(g);
        o.start(t);
        o.stop(t + dur * 1.12);
      }
    }
  }

  /** Distant two-note bird chirp for the menu — pure decoration. */
  private birdsong(t: number): void {
    const base = 2200 + Math.random() * 900;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * 1.25, t + 0.05);
    o.frequency.exponentialRampToValueAtTime(base * 0.92, t + 0.11);
    o.frequency.exponentialRampToValueAtTime(base * 1.18, t + 0.16);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g);
    g.connect(this.glockGain);
    o.start(t);
    o.stop(t + 0.25);
  }


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
    f.frequency.setValueAtTime(freq * 6, t);
    f.frequency.exponentialRampToValueAtTime(freq * 1.4, t + 0.25);
    f.Q.value = 1.2;
    const peak = 0.22 * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(peak * 0.35, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    const mix2 = this.ctx.createGain();
    mix2.gain.value = 0.28;
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

  /** FM bell/piano synthesis. A sine carrier is frequency-modulated by a sine
   *  at carrier×3.5 — the classic DX7 bell algorithm. The modulation index
   *  decays fast (attack transient) while carrier sustains, creating the sharp
   *  attack + ringing tail of a piano or marimba. Sounds leagues above pure sines. */
  private glock(t: number, freq: number, vel: number): void {
    const modRatio = 3.5;
    const modFreq = freq * modRatio;
    // Modulation index in Hz: deviation = modulation_index × carrier_freq.
    // DX7 bell uses index ~3–5. In Web Audio the gain value IS the Hz deviation.
    const modIdx = freq * 4.5 * vel;

    // Modulator amplitude envelope: fast decay creates the bright attack click
    const modEnv = this.ctx.createGain();
    modEnv.gain.setValueAtTime(modIdx, t);
    modEnv.gain.exponentialRampToValueAtTime(modIdx * 0.05, t + 0.35);
    modEnv.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);

    const carrier = this.ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = freq;

    const mod = this.ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = modFreq;
    mod.connect(modEnv);
    modEnv.connect(carrier.frequency); // FM: mod output → carrier frequency input

    // Second partial: shallow FM from 2× oscillator for warmth on attack
    const partialMod = this.ctx.createOscillator();
    const partialEnv = this.ctx.createGain();
    partialMod.type = "sine";
    partialMod.frequency.value = freq * 2;
    partialEnv.gain.setValueAtTime(freq * 1.2 * vel, t); // reasonable deviation
    partialEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    partialMod.connect(partialEnv);
    partialEnv.connect(carrier.frequency);

    // Carrier amplitude envelope
    const g = this.ctx.createGain();
    const peak = 0.52 * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.003);
    g.gain.exponentialRampToValueAtTime(peak * 0.45, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);

    carrier.connect(g);
    g.connect(this.glockGain);

    mod.start(t); mod.stop(t + 2.3);
    partialMod.start(t); partialMod.stop(t + 0.15);
    carrier.start(t); carrier.stop(t + 2.3);
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
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
    g.gain.setValueAtTime(0.5, t + Math.max(0.06, dur - 0.08));
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
    o.start(t);
    lfo.start(t);
    breath.start(t);
    o.stop(t + dur + 0.1);
    lfo.stop(t + dur + 0.1);
    breath.stop(t + dur + 0.1);
  }

  /** Deep bass: sub sine one octave down + fundamental sine + harmonic triangle.
   *  The sub-octave adds the chest-punch felt in Zimmer/Tron scores. */
  private bass(t: number, freq: number, dur: number): void {
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 580;
    f.Q.value = 0.6;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55, t + 0.014);
    g.gain.exponentialRampToValueAtTime(0.32, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    // Sub: one octave down (the Zimmer low-end weight)
    const sub = this.ctx.createOscillator();
    const subG = this.ctx.createGain();
    sub.type = "sine";
    sub.frequency.value = freq * 0.5;
    subG.gain.value = 0.55;
    sub.connect(subG);
    subG.connect(f);

    // Fundamental
    const fund = this.ctx.createOscillator();
    fund.type = "sine";
    fund.frequency.value = freq;

    // Harmonic layer for definition
    const harm = this.ctx.createOscillator();
    const harmG = this.ctx.createGain();
    harm.type = "triangle";
    harm.frequency.value = freq;
    harmG.gain.value = 0.28;
    harm.connect(harmG);
    harmG.connect(f);

    fund.connect(f);
    f.connect(g);
    g.connect(this.bassGain);

    sub.start(t);   sub.stop(t + dur + 0.03);
    fund.start(t);  fund.stop(t + dur + 0.03);
    harm.start(t);  harm.stop(t + dur + 0.03);
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
    g.gain.exponentialRampToValueAtTime(0.16 * vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    src.connect(f);
    f.connect(g);
    g.connect(this.percGain);
    src.start(t);
    src.stop(t + 0.1);
  }

  /** Bright, short hi-hat — the intensity layer's heartbeat. */
  private hat(t: number, vel: number, freq: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 1 + Math.random() * 0.08;
    const f = this.ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14 * vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    src.connect(f);
    f.connect(g);
    g.connect(this.tensionGain);
    src.start(t);
    src.stop(t + 0.06);
  }

  private kick(t: number, vel: number): void {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    // Punchier: higher start (180Hz), deeper finish (32Hz), bigger peak
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(32, t + 0.14);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.72 * vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(g);
    g.connect(this.percGain);
    o.start(t);
    o.stop(t + 0.26);
  }

  /** Snare: noise burst + short tone hit (adds crack on 2&4 in fever). */
  private snare(t: number, vel: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.7;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28 * vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    src.connect(bp);
    bp.connect(hp);
    hp.connect(g);
    g.connect(this.percGain);
    // Tone crack
    const tone = this.ctx.createOscillator();
    const tg = this.ctx.createGain();
    tone.type = "sine";
    tone.frequency.setValueAtTime(200, t);
    tone.frequency.exponentialRampToValueAtTime(90, t + 0.05);
    tg.gain.setValueAtTime(0.0001, t);
    tg.gain.exponentialRampToValueAtTime(0.14 * vel, t + 0.002);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    tone.connect(tg);
    tg.connect(this.percGain);
    src.start(t);
    src.stop(t + 0.18);
    tone.start(t);
    tone.stop(t + 0.1);
  }

  /** Short arpeggio burst: 4 quick notes up from root. Celeste-style fill. */
  private arp(t: number, baseFreq: number, dur: number): void {
    const intervals = [0, 4, 7, 12]; // root, third, fifth, octave
    const stepDur = dur * 0.22;
    for (let i = 0; i < 4; i++) {
      const freq = baseFreq * Math.pow(2, intervals[i]! / 12);
      const nt = t + i * stepDur;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, nt);
      g.gain.exponentialRampToValueAtTime(0.38, nt + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, nt + stepDur * 0.85);
      o.connect(g);
      g.connect(this.arpGain);
      o.start(nt);
      o.stop(nt + stepDur + 0.01);
    }
  }

  /** Interstellar-style organ drone: 3 detuned sines + soft tremolo. */
  private organ(t: number, chordName: string, dur: number): void {
    const root = (BASS_ROOT[chordName] ?? 48) + this.transpose;
    // Root + major 2nd + fifth (open, cinematic voicing like Zimmer's pipe organ)
    const pitches = [root, root + 7, root + 12, root + 19];
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.38, t + dur * 0.18);
    g.gain.setValueAtTime(0.38, t + dur * 0.72);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.05);
    // Slow tremolo (Zimmer's pipe organ breathes at ~3 Hz)
    const lfo = this.ctx.createOscillator();
    const lfoG = this.ctx.createGain();
    lfo.frequency.value = 2.8;
    lfoG.gain.value = 0.06;
    lfo.connect(lfoG);
    lfoG.connect(g.gain);
    const filt = this.ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 600;
    g.connect(filt);
    filt.connect(this.organGain);
    for (const pitch of pitches) {
      for (const det of [-2, 0, 2]) {
        const o = this.ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = mtof(pitch) * Math.pow(2, det / 1200);
        o.connect(g);
        o.start(t);
        o.stop(t + dur + 0.15);
      }
    }
    lfo.start(t);
    lfo.stop(t + dur + 0.15);
  }

  /** Tron lead synth: Daft Punk / Tron Legacy sound.
   *  Sawtooth carrier through a sharp resonant lowpass that opens on attack,
   *  creating the classic "electronic filter sweep" sound of the Grid. */
  private tronLead(t: number, freq: number, dur: number, vel: number): void {
    const o = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    o.type = "sawtooth";
    o2.type = "square";
    o.frequency.value = freq;
    o2.frequency.value = freq * 1.005; // slight detune for width
    f.type = "lowpass";
    f.frequency.setValueAtTime(freq * 12, t);     // bright attack
    f.frequency.exponentialRampToValueAtTime(freq * 2.5, t + 0.08); // filter closes
    f.Q.value = 3.5; // resonant peak = electronic character
    const peak = 0.46 * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005); // hard attack
    g.gain.exponentialRampToValueAtTime(peak * 0.65, t + 0.04);
    g.gain.setValueAtTime(peak * 0.65, t + Math.max(0.05, dur - 0.04));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const mix2 = this.ctx.createGain();
    mix2.gain.value = 0.3;
    o.connect(f);
    o2.connect(mix2);
    mix2.connect(f);
    f.connect(g);
    g.connect(this.tronGain);
    o.start(t);  o.stop(t + dur + 0.02);
    o2.start(t); o2.stop(t + dur + 0.02);
  }

  /** Tron chord stab: short percussive hit used on beat 1 of Tron tracks. */
  private tronStab(t: number, freq: number, dur: number): void {
    const o = this.ctx.createOscillator();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    o.type = "sawtooth";
    o.frequency.value = freq;
    f.type = "lowpass";
    f.frequency.setValueAtTime(freq * 8, t);
    f.frequency.exponentialRampToValueAtTime(freq * 1.8, t + 0.04);
    f.Q.value = 2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    f.connect(g);
    g.connect(this.tronGain);
    o.start(t); o.stop(t + dur + 0.01);
  }

  /** Arcade chiptune lead: two detuned square waves through a bright,
   * resonant filter — the classic 8-bit hook voice. Staccato by default;
   * `dur` extends it for held notes. */
  private chipLead(t: number, freq: number, dur: number, vel: number): void {
    const o = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    o.type = "square";
    o2.type = "square";
    o.frequency.value = freq;
    o2.frequency.value = freq * 1.006; // slight detune for width
    f.type = "lowpass";
    f.frequency.setValueAtTime(freq * 14, t);          // bright attack
    f.frequency.exponentialRampToValueAtTime(Math.max(900, freq * 3.4), t + Math.min(dur, 0.16));
    f.Q.value = 2.2;
    const peak = 0.34 * vel;
    const sustain = Math.max(0.04, dur - 0.035);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004); // hard attack
    g.gain.exponentialRampToValueAtTime(peak * 0.7, t + 0.05);
    g.gain.setValueAtTime(peak * 0.7, t + sustain);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.01);
    const mix2 = this.ctx.createGain();
    mix2.gain.value = 0.35;
    o.connect(f);
    o2.connect(mix2);
    mix2.connect(f);
    f.connect(g);
    g.connect(this.chipGain);
    o.start(t); o.stop(t + dur + 0.03);
    o2.start(t); o2.stop(t + dur + 0.03);
  }

  /** Arcade chiptune bass: short, punchy square through a lowpass — the
   * driving 8-bit root/octave pump under the hook. */
  private chipBass(t: number, freq: number, dur: number, vel: number): void {
    const o = this.ctx.createOscillator();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    o.type = "square";
    o.frequency.value = freq;
    f.type = "lowpass";
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(480, t + Math.max(0.02, dur));
    f.Q.value = 0.9;
    const peak = 0.5 * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    f.connect(g);
    g.connect(this.bassGain);
    o.start(t); o.stop(t + dur + 0.02);
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
      src.start(tt);
      src.stop(tt + 0.2);
    }
  }
}
