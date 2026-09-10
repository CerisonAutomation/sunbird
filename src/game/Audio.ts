import { Music, type BiomeMusicStyle, type MusicMode } from "./Music";

/**
 * Master audio graph:
 *   sfx ──┐
 *   music ┼─► reverb send ─► convolver ─┐
 *         └───────────────────────────► compressor ─► destination
 */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private reverbSend: GainNode | null = null;
  private whooshGain: GainNode | null = null;
  private whooshFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private music: Music | null = null;
  private muted = false;
  private musicOn = true;
  private musicVol = 0.8;
  private sfxVol = 0.9;
  private adMuted = false;
  private started = false;
  private pendingMode: MusicMode = "off";
  private pendingBiome: BiomeMusicStyle = "bright";

  // Ascending musical coin streak tracker
  private coinStreak = 0;
  private lastCoinTime = 0;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();

    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 18;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    comp.connect(this.ctx.destination);

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(comp);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.muted ? 0 : 0.75 * this.sfxVol;
    this.sfxBus.connect(this.master);

    const convolver = this.ctx.createConvolver();
    convolver.buffer = this.makeImpulse(1.8, 2.3);
    const wet = this.ctx.createGain();
    wet.gain.value = 0.34;
    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 1;
    this.reverbSend.connect(convolver);
    convolver.connect(wet);
    wet.connect(this.master);

    this.music = new Music(this.ctx, this.master, this.reverbSend);
    this.music.setLevel(this.musicOn && !this.muted ? 0.64 * this.musicVol : 0);
    this.music.setBiome(this.pendingBiome);
    this.music.setMode(this.pendingMode);

    this.buildWhoosh();
    this.buildWind();
    return this.ctx;
  }

  async resume(): Promise<void> {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }
    this.started = true;
  }

  dispose(): void {
    this.music?.dispose();
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.reverbSend = null;
    this.whooshGain = null;
    this.whooshFilter = null;
    this.windGain = null;
    this.music = null;
  }

  /* ---------- volume & state ---------- */

  setVolumes(musicVol: number, sfxVol: number): void {
    this.musicVol = Math.max(0, Math.min(1, musicVol));
    this.sfxVol = Math.max(0, Math.min(1, sfxVol));
    if (this.music) this.music.setLevel(this.musicOn && !this.muted ? 0.64 * this.musicVol : 0);
    if (this.sfxBus && this.ctx) {
      this.sfxBus.gain.setTargetAtTime(this.muted ? 0 : 0.75 * this.sfxVol, this.ctx.currentTime, 0.05);
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.music?.setLevel(this.musicOn && !m ? 0.64 * this.musicVol : 0);
    if (this.sfxBus && this.ctx) {
      this.sfxBus.gain.setTargetAtTime(m ? 0 : 0.75 * this.sfxVol, this.ctx.currentTime, 0.05);
    }
  }

  setMusicEnabled(on: boolean): void {
    this.musicOn = on;
    this.music?.setLevel(on && !this.muted ? 0.64 * this.musicVol : 0);
  }

  /** Portal SDKs require that audio is silent while an ad has focus. */
  setAdMuted(muted: boolean): void {
    this.adMuted = muted;
    if (!this.master || !this.ctx) return;
    this.master.gain.setTargetAtTime(muted ? 0 : 0.85, this.ctx.currentTime, muted ? 0.01 : 0.08);
  }

  setMusicMode(mode: MusicMode): void {
    this.pendingMode = mode;
    this.music?.setMode(mode);
  }

  setBiome(style: BiomeMusicStyle): void {
    if (style === this.pendingBiome) return;
    this.pendingBiome = style;
    this.music?.setBiome(style);
  }

  duckMusic(amount = 0.4, release = 0.5): void {
    this.music?.duck(amount, release);
  }

  update(
    dt: number,
    speed: number,
    diving: boolean,
    grounded: boolean,
    fever: boolean,
    daylight: number,
    playing: boolean,
    windStrength = 0,
  ): void {
    if (!this.ctx || !this.whooshGain || !this.whooshFilter || !this.windGain || this.adMuted) return;
    const t = this.ctx.currentTime;
    const whoosh =
      playing && grounded && speed > 8
        ? Math.min(0.24, (speed / 90) * (diving ? 0.24 : 0.12))
        : 0.0008;
    this.whooshGain.gain.setTargetAtTime(this.muted ? 0 : whoosh * this.sfxVol, t, 0.05);
    this.whooshFilter.frequency.setTargetAtTime(280 + speed * 18 + (diving ? 220 : 0), t, 0.08);

    const air = playing && !grounded ? Math.min(0.18, speed / 550) : 0;
    const wind = this.muted ? 0 : (air + windStrength * 0.18) * this.sfxVol;
    this.windGain.gain.setTargetAtTime(wind, t, 0.12);

    this.music?.setNight(1 - daylight);
    void dt;
    void fever;
  }

  /* ---------- one-shots with juicy feedback ---------- */

  chirp(): void {
    this.tone(440, 0.14, "sine", 0.16, 980);
    this.tone(660, 0.1, "triangle", 0.06, 1240);
  }

  /**
   * Ascending musical coin chime!
   * Rapid coin collections ascend a soaring pentatonic scale (C6 -> A7)
   * with overtone sparkle and resonant bell harmony on streaks of 5+.
   */
  ding(gem = false): void {
    const now = performance.now();
    if (now - this.lastCoinTime > 1500) {
      this.coinStreak = 0;
    }
    this.coinStreak++;
    this.lastCoinTime = now;

    // Pentatonic scale: C6, D6, E6, G6, A6, C7, D7, E7, G7, A7
    const scale = [1046.5, 1174.66, 1318.51, 1567.98, 1760.0, 2093.0, 2349.32, 2637.02, 3135.96, 3520.0];
    const pitch = scale[Math.min(this.coinStreak - 1, scale.length - 1)]!;
    const freq = gem ? pitch * 1.5 : pitch;

    this.tone(freq, 0.12, "sine", 0.14, freq * 1.04);
    this.tone(freq * 2, 0.08, "triangle", 0.06);

    if (this.coinStreak >= 5 || gem) {
      this.tone(freq * 1.5, 0.22, "sine", 0.08);
    }
  }

  perfect(): void {
    this.tone(523.25, 0.18, "sine", 0.14, 523.25);
    this.tone(659.25, 0.2, "sine", 0.12, 659.25);
    this.tone(783.99, 0.24, "sine", 0.12, 783.99);
    this.tone(1046.5, 0.28, "triangle", 0.08, 1046.5);
  }

  feverOn(): void {
    this.tone(392, 0.12, "square", 0.05, 523.25);
    this.tone(523.25, 0.14, "square", 0.05, 659.25);
    this.tone(783.99, 0.2, "square", 0.06, 1046.5);
    this.tone(1046.5, 0.25, "triangle", 0.08, 1318.5);
  }

  splash(): void {
    this.noiseBurst(0.28, 900, 0.14);
    this.tone(180, 0.2, "sine", 0.09, 70);
  }

  sleep(): void {
    this.tone(392, 0.35, "sine", 0.09, 196);
    this.tone(329.63, 0.5, "triangle", 0.06, 164.81);
  }

  island(): void {
    this.tone(523.25, 0.15, "sine", 0.1, 659.25);
    this.tone(659.25, 0.18, "sine", 0.09, 783.99);
    this.tone(783.99, 0.22, "sine", 0.1, 1046.5);
    this.tone(1046.5, 0.35, "triangle", 0.09, 1318.5);
  }

  cloud(): void {
    this.tone(783.99, 0.14, "sine", 0.1, 1046.5);
    this.tone(1174.66, 0.1, "triangle", 0.05);
  }

  land(impact: number): void {
    const a = Math.min(0.12, impact * 0.014);
    if (a < 0.02) return;
    this.noiseBurst(0.08, 420, a);
  }

  zenith(): void {
    this.tone(880, 0.5, "sine", 0.09, 1760);
    this.tone(1320, 0.6, "triangle", 0.05, 1320);
    this.tone(660, 0.4, "sine", 0.06, 990);
  }

  powerup(): void {
    this.tone(659.25, 0.1, "square", 0.05, 987.77);
    this.tone(987.77, 0.14, "square", 0.05, 1318.5);
  }

  shield(): void {
    this.tone(320, 0.25, "sine", 0.12, 640);
    this.noiseBurst(0.16, 1300, 0.07);
  }

  purchase(): void {
    this.tone(523.25, 0.1, "triangle", 0.09, 659.25);
    this.tone(783.99, 0.2, "triangle", 0.09, 1046.5);
    this.tone(1046.5, 0.32, "sine", 0.07);
  }

  thermal(): void {
    this.tone(329.63, 0.5, "sine", 0.06, 659.25);
    this.tone(493.88, 0.4, "triangle", 0.04, 987.77);
  }

  gust(): void {
    this.noiseBurst(0.6, 750, 0.06);
  }

  storm(): void {
    this.noiseBurst(0.35, 320, 0.12);
    this.tone(90, 0.3, "sine", 0.09, 50);
  }

  butter(): void {
    this.tone(1046.5, 0.08, "sine", 0.07, 1318.5);
    this.tone(1318.5, 0.12, "sine", 0.06, 1567.98);
  }

  launchWhoosh(rating: string, speed: number): void {
    const speedRatio = Math.min(1.5, Math.max(0.4, speed / 55));
    const baseFreq = rating === "perfect" ? 784 : rating === "great" ? 587 : 440;
    this.tone(baseFreq, 0.18, "sine", 0.12 * speedRatio, baseFreq * 1.6);
    this.noiseBurst(0.2, 800 + speed * 12, 0.07 * speedRatio);
  }

  /* ---------- synth primitives ---------- */

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number): void {
    if (!this.ctx || !this.sfxBus || !this.reverbSend || this.muted || !this.started) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    const t = this.ctx.currentTime;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
    const effGain = Math.max(0.0001, gain * this.sfxVol);
    g.gain.setValueAtTime(effGain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.sfxBus);
    const send = this.ctx.createGain();
    send.gain.value = 0.35;
    g.connect(send);
    send.connect(this.reverbSend);
    o.start();
    o.stop(t + dur + 0.03);
  }

  private noiseBurst(dur: number, freq: number, gain: number): void {
    if (!this.ctx || !this.sfxBus || this.muted || !this.started) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = freq;
    const g = this.ctx.createGain();
    const effGain = Math.max(0.0001, gain * this.sfxVol);
    g.gain.setValueAtTime(effGain, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxBus);
    src.start();
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const env = Math.pow(1 - i / len, decay);
        d[i] = (Math.random() * 2 - 1) * env * (i < 400 ? i / 400 : 1);
      }
    }
    return buf;
  }

  private buildWhoosh(): void {
    if (!this.ctx || !this.sfxBus) return;
    const len = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 600;
    filter.Q.value = 0.7;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxBus);
    src.start();
    this.whooshFilter = filter;
    this.whooshGain = g;
  }

  private buildWind(): void {
    if (!this.ctx || !this.sfxBus) return;
    const len = this.ctx.sampleRate * 3;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let a = 0;
    let b = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      a = 0.997 * a + 0.003 * white;
      b = 0.95 * b + 0.05 * white;
      data[i] = (a * 6 + b * 0.6) * 0.8;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxBus);
    src.start();
    this.windGain = g;
  }
}
