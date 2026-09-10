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
export type MusicMode = "off" | "menu" | "play" | "fever" | "sleep";
export type BiomeMusicStyle = "bright" | "warm" | "airy" | "wide" | "night" | "crystal";

type Voicing = number[];

const BEAT_BPM = 112;
const LOOKAHEAD = 0.16;
const TICK_MS = 25;

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

// Strum pattern per eighth: 1 = down, 2 = up, 0 = none (island strum D _ D U _ U D U)
const STRUM = [1, 0, 1, 2, 0, 2, 1, 2];

const SECTIONS: { prog: string[]; mel: number[] }[] = [
  { prog: PROG_A, mel: MEL_A },
  { prog: PROG_A, mel: MEL_A },
  { prog: PROG_B, mel: MEL_B },
  { prog: PROG_C, mel: MEL_C },
  { prog: PROG_D, mel: MEL_D },
];

// Per-biome orchestration keeps each island sonically distinct while all
// variants share the same original melodic identity.
const BIOME_MIX: Record<BiomeMusicStyle, { bpm: number; fever: number; cutoff: number; uke: number; glock: number; bass: number; perc: number; whistle: number; transpose: number }> = {
  bright: { bpm: 112, fever: 126, cutoff: 9000, uke: 1, glock: 1, bass: 1, perc: 1, whistle: 1, transpose: 0 },
  warm: { bpm: 106, fever: 122, cutoff: 6200, uke: 1.18, glock: 0.82, bass: 1.12, perc: 0.9, whistle: 0.9, transpose: -2 },
  airy: { bpm: 116, fever: 130, cutoff: 9800, uke: 0.88, glock: 1.18, bass: 0.9, perc: 1.15, whistle: 1.08, transpose: 2 },
  wide: { bpm: 110, fever: 124, cutoff: 7500, uke: 0.85, glock: 0.9, bass: 1.22, perc: 0.95, whistle: 1.1, transpose: -3 },
  night: { bpm: 104, fever: 120, cutoff: 4600, uke: 0.68, glock: 1.3, bass: 0.82, perc: 0.65, whistle: 0.85, transpose: -5 },
  crystal: { bpm: 114, fever: 128, cutoff: 10500, uke: 0.78, glock: 1.36, bass: 0.92, perc: 1.04, whistle: 1.25, transpose: 4 },
};

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
  private bpm = BEAT_BPM;
  private night = 0;
  private biome: BiomeMusicStyle = "bright";
  private transpose = 0;
  private lastCutoff = 9000;

  private readonly bus: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly duckGain: GainNode;
  private readonly ukeGain: GainNode;
  private readonly glockGain: GainNode;
  private readonly bassGain: GainNode;
  private readonly percGain: GainNode;
  private readonly whistleGain: GainNode;
  private readonly lullabyGain: GainNode;
  private readonly noise: AudioBuffer;
  private lullabyStep = 0;
  private baseLevel = 0;

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    private readonly reverbSend: AudioNode,
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

    const mk = (v: number): GainNode => {
      const g = ctx.createGain();
      g.gain.value = v;
      g.connect(this.bus);
      return g;
    };
    this.ukeGain = mk(0.34);
    this.glockGain = mk(0.3);
    this.bassGain = mk(0.42);
    this.percGain = mk(0);
    this.whistleGain = mk(0);
    this.lullabyGain = mk(0);

    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMode(mode: MusicMode): void {
    if (mode === this.targetMode) return;
    this.targetMode = mode;
    this.apply();
  }

  setNight(t: number): void {
    this.night = Math.max(0, Math.min(1, t));
    const cutoff = BIOME_MIX[this.biome].cutoff - this.night * 4200;
    if (Math.abs(cutoff - this.lastCutoff) < 12) return;
    this.lastCutoff = cutoff;
    this.filter.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.6);
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

  duck(amount = 0.45, release = 0.5): void {
    const t = this.ctx.currentTime;
    this.duckGain.gain.cancelScheduledValues(t);
    this.duckGain.gain.setTargetAtTime(1 - amount, t, 0.02);
    this.duckGain.gain.setTargetAtTime(1, t + 0.12, release);
  }

  dispose(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private apply(): void {
    const t = this.ctx.currentTime;
    const m = this.targetMode;
    const on = this.baseLevel > 0 && m !== "off";
    this.bus.gain.setTargetAtTime(on ? this.baseLevel : 0, t, 0.5);

    const style = BIOME_MIX[this.biome];
    this.transpose = style.transpose;
    const song = m === "menu" || m === "play" || m === "fever";
    this.ukeGain.gain.setTargetAtTime(song ? (m === "menu" ? 0.3 : 0.36) * style.uke : 0, t, 0.4);
    this.glockGain.gain.setTargetAtTime(song ? (m === "menu" ? 0.24 : 0.32) * style.glock : 0, t, 0.4);
    this.bassGain.gain.setTargetAtTime(song ? 0.42 * style.bass : 0, t, 0.4);
    this.percGain.gain.setTargetAtTime((m === "play" ? 0.28 : m === "fever" ? 0.36 : 0) * style.perc, t, 0.3);
    this.whistleGain.gain.setTargetAtTime((m === "fever" ? 0.22 : 0) * style.whistle, t, 0.3);
    this.lullabyGain.gain.setTargetAtTime(m === "sleep" ? 0.3 : 0, t, 0.6);
    this.filter.frequency.setTargetAtTime(style.cutoff - this.night * 4200, t, 0.55);
    this.lastCutoff = style.cutoff - this.night * 4200;
    this.bpm = m === "fever" ? style.fever : style.bpm;

    if (this.mode === "off" && m !== "off") this.start();
    this.mode = m;
  }

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
      else this.scheduleStep(this.nextTime);
      this.advance();
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
        this.section = (this.section + 1) % SECTIONS.length;
      }
    }
  }

  private scheduleStep(t: number): void {
    const sec = SECTIONS[this.section]!;
    const chordName = sec.prog[this.bar]!;
    const chord = UKE[chordName]!;
    const idx = this.bar * 8 + this.step;
    const beat = 60 / this.bpm;

    // Ukulele strum
    const strum = STRUM[this.step]!;
    if (strum) {
      const accent = this.step === 0 ? 1 : this.step === 4 ? 0.85 : 0.65;
      const order = strum === 1 ? chord : [...chord].reverse();
      order.forEach((m, i) => this.pluck(t + i * 0.011, mtof(m + this.transpose), accent * (0.7 + 0.3 * Math.random())));
    }

    // Bass: root on 1, fifth or root on 3, occasional walk-up on 8
    if (this.step === 0) this.bass(t, mtof(BASS_ROOT[chordName]! + this.transpose), beat * 0.9);
    if (this.step === 4) this.bass(t, mtof(BASS_ROOT[chordName]! + (this.bar % 2 ? 7 : 0) + this.transpose), beat * 0.8);
    if (this.step === 7 && this.bar % 4 === 3) this.bass(t, mtof(BASS_ROOT[chordName]! + 5 + this.transpose), beat * 0.4);

    // Glockenspiel melody
    const note = sec.mel[idx] ?? 0;
    if (note > 0) {
      const sparse = this.mode === "menu" && this.step % 2 === 1 && Math.random() < 0.5;
      if (!sparse) this.glock(t, mtof(note + this.transpose), this.step === 0 ? 1 : 0.8);
    }

    // Percussion
    if (this.mode === "play" || this.mode === "fever") {
      this.shaker(t, this.step % 2 === 0 ? 0.55 : 0.32);
      if (this.step === 0 || this.step === 4) this.kick(t, this.step === 0 ? 1 : 0.8);
      if (this.mode === "fever" && (this.step === 2 || this.step === 6)) this.clap(t);
      if (this.step === 7 && this.bar % 2 === 1) this.shaker(t + beat * 0.22, 0.4);
    }

    // Whistle (fever)
    if (this.mode === "fever") {
      const w = WHISTLE[idx] ?? 0;
      if (w > 0) {
        let len = 1;
        while (WHISTLE[idx + len] === -1) len++;
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
    g.connect(this.reverbSend);
    o.start(t);
    o.stop(t + 1.5);
  }

  /* ---------- instruments ---------- */

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
    const peak = 0.36 * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.003);
    g.gain.exponentialRampToValueAtTime(peak * 0.25, t + 0.18);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    const partials: [number, number][] = [
      [1, 1],
      [2.76, 0.35],
      [5.4, 0.12],
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
      o.stop(t + 1.2);
    }
    g.connect(this.glockGain);
    const send = this.ctx.createGain();
    send.gain.value = 0.5;
    g.connect(send);
    send.connect(this.reverbSend);
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
    const send = this.ctx.createGain();
    send.gain.value = 0.4;
    g.connect(send);
    send.connect(this.reverbSend);
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

  private kick(t: number, vel: number): void {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.11);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55 * vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g);
    g.connect(this.percGain);
    o.start(t);
    o.stop(t + 0.22);
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
