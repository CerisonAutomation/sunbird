/**
 * Original procedural island-folk score: ukulele strums, glockenspiel melody,
 * whistled lead, upright-style bass, shaker / kick / clap. Everything is
 * synthesized in-browser — no copied audio and no samples.
 *
 * Layers respond to game state:
 *   menu  → uke + sparse glock + bass
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
  C: [67, 60, 64, 72],
  G: [67, 62, 67, 71],
  Am: [69, 60, 64, 69],
  F: [69, 60, 65, 69],
  Em: [67, 59, 64, 67],
  Dm: [69, 62, 65, 69],
};

const BASS_ROOT: Record<string, number> = { C: 48, G: 43, Am: 45, F: 41, Em: 40, Dm: 38 };

const PROG_A = ["C", "G", "Am", "F", "C", "G", "F", "G"];
const PROG_B = ["Am", "F", "C", "G", "Am", "F", "C", "G"];
const PROG_C = ["F", "G", "Em", "Am", "F", "G", "C", "C"];
const PROG_D = ["Dm", "G", "C", "Am", "F", "G", "C", "G"];
const PROG_E = ["C", "Am", "F", "G", "C", "Am", "F", "G"];
const PROG_F = ["Am", "Em", "F", "C", "Am", "Em", "F", "C"];
const PROG_G = ["C", "G", "Dm", "Am", "C", "G", "Dm", "Am"];
const PROG_H = ["G", "C", "Am", "F", "G", "C", "Am", "F"];
const PROG_I = ["F", "C", "Dm", "G", "F", "C", "Dm", "G"];
const PROG_J = ["Am", "C", "G", "F", "Am", "C", "G", "F"];

// Melodies: one entry per eighth note (0 = rest, -1 = hold previous)
const MEL_A = [
  76, 0, 79, 0, 76, 74, 72, 0,
  74, 0, 0, 71, 74, 0, 67, 0,
  69, 0, 72, 0, 76, 0, 74, 72,
  69, -1, 0, 0, 72, 0, 74, 0,
  76, 0, 79, 0, 81, 0, 79, 76,
  74, -1, 0, 0, 71, 0, 74, 0,
  72, 0, 69, 0, 65, 0, 69, 72,
  74, -1, -1, -1, 0, 0, 0, 0,
];

const MEL_B = [
  76, -1, 0, 0, 72, 0, 69, 0,
  72, -1, 0, 0, 69, 0, 65, 0,
  67, -1, 0, 0, 72, 0, 76, 0,
  74, -1, -1, -1, 0, 0, 0, 0,
  76, 0, 79, 0, 81, 0, 79, 76,
  77, -1, 0, 0, 76, 0, 72, 0,
  76, -1, 0, 0, 74, 0, 72, 0,
  74, 0, 71, 0, 67, -1, 0, 0,
];

const MEL_C = [
  81, 0, 0, 79, 77, 0, 0, 76,
  74, 0, 0, 71, 74, 0, 79, 0,
  76, 0, 0, 74, 71, 0, 0, 67,
  69, -1, -1, 0, 72, 0, 76, 0,
  77, 0, 0, 76, 74, 0, 0, 72,
  74, 0, 0, 71, 74, 0, 79, 0,
  84, -1, 0, 0, 79, 0, 76, 0,
  72, -1, -1, -1, 0, 0, 0, 0,
];

// A bridge with more space between phrases. It keeps longer sessions from
// reading as a short loop and leaves room for the landscape/wind layers.
const MEL_D = [
  74, 0, 77, 0, 81, -1, 0, 0,
  79, 0, 74, 0, 71, -1, 0, 0,
  72, 0, 76, 0, 79, 0, 76, 0,
  72, -1, 0, 0, 69, 0, 72, 0,
  77, 0, 81, 0, 84, -1, 0, 0,
  79, 0, 76, 0, 74, -1, 0, 0,
  72, 0, 76, 0, 79, 0, 84, 0,
  79, -1, 76, -1, 72, -1, 0, 0,
];

// Track 5 — Coral Breeze: bright, rippling, climbs and settles like surf.
const MEL_E = [
  72, 0, 74, 0, 76, 0, 79, 0,
  76, 0, 72, 0, 69, 0, 72, 0,
  65, 0, 69, 0, 72, 0, 74, 0,
  74, 0, 72, 0, 71, 0, 72, 0,
  72, 0, 76, 0, 79, 0, 81, 0,
  79, 0, 76, 0, 72, 0, 76, 0,
  77, 0, 76, 0, 74, 0, 72, 0,
  74, -1, -1, 0, 0, 0, 0, 0,
];

// Track 6 — Moonlight Flutter: sparse, descending, a night that breathes.
const MEL_F = [
  69, 0, 72, 0, 76, 0, 72, 0,
  71, 0, 74, 0, 76, 0, 74, 0,
  65, 0, 69, 0, 72, 0, 74, 0,
  72, 0, 69, 0, 65, 0, 67, 0,
  69, 0, 72, 0, 76, 0, 79, 0,
  76, 0, 74, 0, 71, 0, 74, 0,
  77, 0, 74, 0, 72, 0, 69, 0,
  72, -1, -1, -1, 0, 0, 0, 0,
];

// Track 7 — Glass Ocean: crystalline high sparkle over calm harmony.
const MEL_G = [
  76, 0, 79, 0, 84, 0, 81, 0,
  79, 0, 76, 0, 74, 0, 76, 0,
  74, 0, 72, 0, 69, 0, 72, 0,
  69, 0, 72, 0, 76, 0, 74, 0,
  76, 0, 79, 0, 84, 0, 86, 0,
  84, 0, 81, 0, 79, 0, 76, 0,
  74, 0, 72, 0, 69, 0, 72, 0,
  74, -1, 72, -1, 0, 0, 0, 0,
];

// Track 8 — Trade Winds: broad stepwise phrases that push and ease.
const MEL_H = [
  74, 0, 71, 0, 72, 0, 74, 0,
  76, 0, 79, 0, 76, 0, 74, 0,
  72, 0, 69, 0, 72, 0, 76, 0,
  74, 0, 72, 0, 69, 0, 65, 0,
  74, 0, 71, 0, 72, 0, 74, 0,
  79, 0, 76, 0, 74, 0, 72, 0,
  69, 0, 72, 0, 76, 0, 74, 0,
  72, -1, -1, 0, 0, 0, 0, 0,
];

// Track 9 — Golden Hour: held, warm notes that stretch the last light.
const MEL_I = [
  77, -1, 0, 0, 76, 0, 74, 0,
  72, -1, 0, 0, 69, 0, 72, 0,
  74, -1, 0, 0, 72, 0, 69, 0,
  71, 0, 72, 0, 74, -1, 0, 0,
  77, -1, 0, 0, 79, 0, 77, 0,
  76, -1, 0, 0, 74, 0, 72, 0,
  74, -1, 0, 0, 72, 0, 74, 0,
  76, -1, 74, -1, 72, -1, 0, 0,
];

// Track 10 — Starlight: twinkling wide leaps between a warm low register.
const MEL_J = [
  81, 0, 76, 0, 81, 0, 84, 0,
  79, 0, 76, 0, 72, 0, 76, 0,
  74, 0, 71, 0, 74, 0, 76, 0,
  77, 0, 74, 0, 72, 0, 69, 0,
  81, 0, 76, 0, 81, 0, 86, 0,
  84, 0, 81, 0, 79, 0, 76, 0,
  74, 0, 71, 0, 74, 0, 79, 0,
  77, -1, 76, -1, 72, -1, 0, 0,
];

// Track 11 — Tide Runner: rippling ascents and cascading steps, playful surf-light.
const MEL_K = [
  72,  0, 74, 76, 79,  0, 76, 79,
  81,  0, 79, 76, 74,  0, 72,  0,
  69, 72, 74, 72, 77,  0, 74, 72,
  71,  0, 74,  0, 76, 79, 76,  0,
  79,  0, 81,  0, 84,  0, 81, 79,
  76, 74, 72,  0, 69, 72, 74,  0,
  77,  0, 74, 76, 79, 76, 74,  0,
  72, -1,  0,  0, 74, -1,  0,  0,
];

// Track 12 — Magma Drift: sparse descending phrases, brooding volcanic weight.
const MEL_L = [
  69, -1,  0,  0, 65,  0, 64,  0,
  62, -1,  0,  0, 64,  0, 65,  0,
  65,  0, 69,  0, 72,  0, 69,  0,
  67, -1,  0,  0, 65, -1,  0,  0,
  69,  0, 67, 65, 64,  0, 62,  0,
  60, -1,  0,  0, 62, 64, 65,  0,
  65,  0,  0, 69, 72, -1,  0,  0,
  67, -1, -1, -1,  0,  0,  0,  0,
];

// Track 13 — Mesa Wind: wide leaping phrases with canyon space between.
const MEL_M = [
  65,  0,  0,  0, 72,  0, 77,  0,
  76,  0,  0, 72, 69,  0,  0,  0,
  69, 72, 74,  0, 72,  0, 69,  0,
  67,  0, 71,  0, 74, -1,  0,  0,
  65,  0,  0,  0, 77,  0, 81,  0,
  79,  0, 76, 72, 69,  0, 72,  0,
  74,  0, 72, 71, 69,  0, 65,  0,
  67, -1, -1,  0,  0,  0,  0,  0,
];

// Track 14 — Time's Light: Interstellar-style soaring — slow, wide intervals,
// descends then launches skyward. Perfect for high-altitude moments.
const MEL_N = [
  72, -1, -1, -1, 79, -1, -1,  0,
  77, -1,  0,  0, 74, -1,  0,  0,
  72,  0, 69,  0, 72,  0, 76,  0,
  79, -1, -1, -1,  0,  0,  0,  0,
  81, -1, -1, -1, 84, -1, -1,  0,
  83, -1,  0,  0, 81, -1,  0,  0,
  79,  0, 76,  0, 74, -1,  0,  0,
  72, -1, -1, -1,  0,  0,  0,  0,
];

// Track 15 — Horizon Chase: Journey-style hero theme — calls, answers, resolves.
// Uplifting, memorable, built to echo in your head after you close the tab.
const MEL_O = [
  76,  0, 79, 0, 81, -1,  0,  0,
  79,  0, 76, 0, 74,  0, 72,  0,
  74,  0, 72, 0, 69,  0, 72,  0,
  74, -1,  0, 0,  0,  0,  0,  0,
  76,  0, 79, 0, 84,  0, 86,  0,
  84,  0, 81, 0, 79, -1,  0,  0,
  76,  0, 74, 0, 72,  0, 74,  0,
  76, -1, 74,-1, 72, -1,  0,  0,
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

export type Track = { name: string; prog: string[]; mel: number[]; mood: BiomeMusicStyle };

/**
 * Thirteen original island-folk compositions. Each is a full 8-bar song — its
 * own chord progression, lead melody, and a `mood` matching the biome
 * orchestration it was written for, so the shuffle can favor tracks that suit
 * the current island and time of day while still cycling all thirteen.
 */
export const TRACKS: Track[] = [
  { name: "Island Sunrise",    prog: PROG_A, mel: MEL_A, mood: "bright"  },
  { name: "Lazy Current",      prog: PROG_B, mel: MEL_B, mood: "airy"    },
  { name: "Hilltop Hop",       prog: PROG_C, mel: MEL_C, mood: "bright"  },
  { name: "Sunset Glide",      prog: PROG_D, mel: MEL_D, mood: "warm"    },
  { name: "Coral Breeze",      prog: PROG_E, mel: MEL_E, mood: "airy"    },
  { name: "Moonlight Flutter", prog: PROG_F, mel: MEL_F, mood: "night"   },
  { name: "Glass Ocean",       prog: PROG_G, mel: MEL_G, mood: "crystal" },
  { name: "Trade Winds",       prog: PROG_H, mel: MEL_H, mood: "wide"    },
  { name: "Golden Hour",       prog: PROG_I, mel: MEL_I, mood: "warm"    },
  { name: "Starlight",         prog: PROG_J, mel: MEL_J, mood: "night"   },
  { name: "Tide Runner",       prog: PROG_E, mel: MEL_K, mood: "reef"    },
  { name: "Magma Drift",       prog: PROG_F, mel: MEL_L, mood: "ember"   },
  { name: "Mesa Wind",         prog: PROG_I, mel: MEL_M, mood: "canyon"  },
  { name: "Time's Light",      prog: PROG_B, mel: MEL_N, mood: "wide"    },
  { name: "Horizon Chase",     prog: PROG_H, mel: MEL_O, mood: "bright"  },
  { name: "Fever Dream",       prog: PROG_E, mel: MEL_P, mood: "reef"    },
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
  private readonly noise: AudioBuffer;
  private lullabyStep = 0;
  private baseLevel = 0;

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    reverbSend: AudioNode,
  ) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 9000;
    this.filter.Q.value = 0.4;
    this.duckGain = ctx.createGain();
    this.duckGain.gain.value = 1;
    this.bus.connect(this.filter);
    this.filter.connect(this.duckGain);
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

    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.buildOrder();
    this.section = this.order[0] ?? 0;
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

  /** Continuous intensity — opens the filter and adds a tension hat layer. */
  setIntensity(v: number): void {
    const t = Math.max(0, Math.min(1, v));
    if (Math.abs(t - this.intensityTarget) < 0.01) return;
    this.intensityTarget = t;
    const now = this.ctx.currentTime;
    // The tension layer rides up quickly for responsiveness, decays a touch
    // slower so a big moment lingers after the peak.
    const style = BIOME_MIX[this.biome];
    this.tensionGain.gain.setTargetAtTime(t * 0.24 * style.perc, now, t > this.intensity ? 0.1 : 0.4);
    this.recomputeCutoff(0.3);
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
    if (this.timer !== null) this.onTrackChange?.(TRACKS[this.section]!.name);
  }

  get trackName(): string {
    return TRACKS[this.section]?.name ?? "";
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
    const mood = TRACKS[index]!.mood;
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
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.bus.disconnect();
    this.filter.disconnect();
    this.duckGain.disconnect();
    this.wetGain.disconnect();
  }

  private apply(): void {
    const t = this.ctx.currentTime;
    const m = this.targetMode;
    const on = this.baseLevel > 0 && m !== "off";
    this.bus.gain.setTargetAtTime(on ? this.baseLevel : 0, t, 0.5);

    const style = BIOME_MIX[this.biome];
    this.transpose = style.transpose;
    const song = m === "menu" || m === "play" || m === "fever" || m === "storm";
    // Fever: glock leads more prominently (it's the hook the ear remembers).
    this.ukeGain.gain.setTargetAtTime(song ? (m === "menu" ? 0.28 : m === "fever" ? 0.26 : 0.32) * style.uke : 0, t, 0.4);
    this.glockGain.gain.setTargetAtTime(song ? (m === "menu" ? 0.22 : m === "fever" ? 0.38 : 0.30) * style.glock : 0, t, 0.4);
    this.bassGain.gain.setTargetAtTime(song ? (m === "fever" ? 0.48 : 0.42) * style.bass : 0, t, 0.4);
    this.percGain.gain.setTargetAtTime((m === "play" ? 0.22 : m === "fever" ? 0.36 : m === "storm" ? 0.46 : 0) * style.perc, t, 0.3);
    this.whistleGain.gain.setTargetAtTime((m === "fever" ? 0.30 : 0) * style.whistle, t, 0.3);
    this.arpGain.gain.setTargetAtTime(m === "fever" ? 0.18 * style.glock : 0, t, 0.5);
    // Organ: Interstellar-style deep pad. Swells in play and fever.
    this.organGain.gain.setTargetAtTime(m === "play" ? 0.10 : m === "fever" ? 0.18 : m === "menu" ? 0.06 : 0, t, 1.2);
    // Warm pad bed: strongest on the menu, subtle underneath play.
    this.padGain.gain.setTargetAtTime(m === "menu" ? 0.18 : m === "play" ? 0.06 : 0, t, 0.8);
    this.lullabyGain.gain.setTargetAtTime(m === "sleep" ? 0.3 : 0, t, 0.6);
    const cutoff = musicCutoff(style.cutoff, this.night, this.intensityTarget, this.ctx.sampleRate);
    this.filter.frequency.setTargetAtTime(cutoff, t, 0.55);
    this.lastCutoff = cutoff;
    this.bpm = m === "fever" ? style.fever : style.bpm;

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

    // Chord pad: one swell per bar — two detuned triangles on root+fifth an
    // octave down. ~6 oscillators/bar; negligible cost, huge warmth.
    if (this.step === 0 && (this.mode === "menu" || this.mode === "play")) this.pad(t, chordName, beat * 4);

    // Menu-only birdsong: an occasional far-away sparkle chirp, seeded by the
    // bar so it stays sparse and never machine-guns.
    if (this.mode === "menu" && this.step === 6 && Math.random() < 0.3) {
      this.birdsong(t + Math.random() * beat * 0.5);
    }

    // Ukulele strum
    const strum = STRUM[this.step]!;
    if (strum) {
      const accent = this.step === 0 ? 1 : this.step === 4 ? 0.85 : 0.65;
      const order = strum === 1 ? chord : [...chord].reverse();
      order.forEach((m, i) => this.pluck(t + i * 0.011 + Math.random() * 0.004, mtof(m + this.transpose + stormShift), accent * (0.7 + 0.3 * Math.random())));
    }

    // Bass: root on 1, fifth or root on 3, occasional walk-up on 8
    if (this.step === 0) this.bass(t, mtof(BASS_ROOT[chordName]! + this.transpose + stormShift), beat * 0.9);
    if (this.step === 4) this.bass(t, mtof(BASS_ROOT[chordName]! + (this.bar % 2 ? 7 : 0) + this.transpose + stormShift), beat * 0.8);
    if (this.step === 7 && this.bar % 4 === 3) this.bass(t, mtof(BASS_ROOT[chordName]! + 5 + this.transpose + stormShift), beat * 0.4);

    // Glockenspiel melody
    const note = sec.mel[idx] ?? 0;
    if (note > 0) {
      const sparse = this.mode === "menu" && this.step % 2 === 1 && Math.random() < 0.5;
      if (!sparse) this.glock(t, mtof(note + this.transpose + stormShift), this.step === 0 ? 1 : 0.8);
    }

    // Percussion
    if (this.mode === "play" || this.mode === "fever" || this.mode === "storm") {
      // Leave breathing space in normal flight; fever earns the busy groove.
      if (this.mode !== "play" || this.step % 2 === 0 || this.intensity > 0.65) {
        this.shaker(t, this.step % 2 === 0 ? 0.48 : 0.24);
      }
      if (this.step === 0 || this.step === 4) this.kick(t, this.step === 0 ? 1 : 0.82);
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
    if ((this.mode === "play" || this.mode === "fever") && this.step === 0 && this.bar % 2 === 0) {
      this.organ(t, chordName, beat * 8);
    }

    // Arp bursts in fever — Celeste-style fills on offbeats between melody notes.
    if (this.mode === "fever" && (this.step === 1 || this.step === 5) && this.intensity > 0.3) {
      const arpNote = (UKE[chordName]?.[1] ?? 60) + 24 + this.transpose + stormShift;
      this.arp(t, mtof(arpNote), beat * 0.9);
    }

    // Whistle (fever) — alternate between WHISTLE and WHISTLE_B each 4-bar phrase.
    if (this.mode === "fever") {
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

  /** Bar-long chord swell: two detuned triangles + a fifth, lowpassed. */
  private pad(t: number, chordName: string, dur: number): void {
    const root = (BASS_ROOT[chordName] ?? 48) + 12 + this.transpose;
    const notes = [root, root + 7];
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + dur * 0.3);
    g.gain.setValueAtTime(0.5, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 900;
    g.connect(f);
    f.connect(this.padGain);
    for (const m of notes) {
      for (const det of [-4, 4]) {
        const o = this.ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = mtof(m) * Math.pow(2, det / 1200);
        o.connect(g);
        o.start(t);
        o.stop(t + dur + 0.05);
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

  private glock(t: number, freq: number, vel: number): void {
    const g = this.ctx.createGain();
    // Brighter peak, longer ring (like a real glockenspiel bar or celesta)
    const peak = 0.44 * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.002);
    g.gain.exponentialRampToValueAtTime(peak * 0.3, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    // 4 partials (real marimba/glock harmonic series)
    const partials: [number, number][] = [
      [1,    1    ],
      [2.76, 0.42 ],
      [5.4,  0.15 ],
      [8.93, 0.06 ],
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
      o.stop(t + 1.7);
    }
    g.connect(this.glockGain);
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

  private bass(t: number, freq: number, dur: number): void {
    const o = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    o.type = "sine";
    o2.type = "triangle";
    o.frequency.value = freq;
    o2.frequency.value = freq;
    f.type = "lowpass";
    f.frequency.value = 420;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.28, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const m2 = this.ctx.createGain();
    m2.gain.value = 0.35;
    o.connect(f);
    o2.connect(m2);
    m2.connect(f);
    f.connect(g);
    g.connect(this.bassGain);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.02);
    o2.stop(t + dur + 0.02);
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
