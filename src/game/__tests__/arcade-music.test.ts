import { afterEach, describe, expect, it, vi } from "vitest";
import { Music, TRACKS, TRACK_NAMES } from "../Music";

// Fake WebAudio graph — same pattern as music-mix.test.ts. The assertions
// below pin the ARCADE CHIP family contract: the viral-game bangers must
// stay first in the picker, stay instrumented as chiptune (square lead +
// driving bass, no ukulele/glock), and run their own fast tempo.

class Param {
  value = 0;
  setTargetAtTime(v: number): void { this.value = v; }
  setValueAtTime(v: number): void { this.value = v; }
  exponentialRampToValueAtTime(v: number): void { this.value = v; }
  cancelScheduledValues(): void { /* no audio clock */ }
}
class Node {
  gain = new Param();
  frequency = new Param();
  threshold = new Param();
  knee = new Param();
  ratio = new Param();
  attack = new Param();
  release = new Param();
  playbackRate = new Param();
  Q = new Param();
  type = "";
  edges: Node[] = [];
  connect(node: Node): void { this.edges.push(node); }
  disconnect(): void { this.edges = []; }
  start(): void { /* no audio device */ }
  stop(): void { /* no audio device */ }
}
function fixture() {
  const nodes: Node[] = [];
  const create = (): Node => { const n = new Node(); nodes.push(n); return n; };
  const dry = new Node();
  const wet = new Node();
  const ctx = {
    currentTime: 0,
    state: "running",
    sampleRate: 44100,
    createGain: create,
    createBiquadFilter: create,
    createDynamicsCompressor: create,
    createOscillator: create,
    createBufferSource: create,
    createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
  };
  const music = new Music(ctx as unknown as AudioContext, dry as unknown as AudioNode, wet as unknown as AudioNode);
  return { music, nodes, ctx, dry, wet };
}

/** Private state, exposed for contract assertions. */
type MusicInternals = {
  isChipTrack: boolean;
  isTronTrack: boolean;
  bpm: number;
  ukeGain: { gain: { value: number } };
  glockGain: { gain: { value: number } };
  chipGain: { gain: { value: number } };
  sparkGain: { gain: { value: number } };
  whistleGain: { gain: { value: number } };
  percGain: { gain: { value: number } };
};
const internals = (m: Music): MusicInternals => m as unknown as MusicInternals;

afterEach(() => { vi.useRealTimers(); });

describe("arcade chiptune family", () => {
  it("the six bangers lead the track list, and every entry is schedulable", () => {
    expect(TRACKS.length).toBe(30);
    const chipCount = TRACKS.filter((t) => t.chip).length;
    expect(chipCount).toBe(10);
    // Front and center: the whole chip family sits at the top of the picker.
    for (let i = 0; i < 10; i++) expect(TRACKS[i]!.chip, TRACK_NAMES[i]).toBe(true);
    for (let i = 10; i < TRACKS.length; i++) expect(TRACKS[i]!.chip).toBeFalsy();
    // A typo'd chord name would crash at runtime (UKE[chord] is a
    // non-null assertion) — pin the data contract.
    const knownChords = new Set(["C", "G", "Am", "F", "Em", "Dm", "Gm"]);
    for (const t of TRACKS) {
      expect(t.prog).toHaveLength(8);
      for (const chord of t.prog) expect(knownChords.has(chord), `${t.name}: chord ${chord}`).toBe(true);
      expect(t.mel).toHaveLength(64);
      for (const n of t.mel) {
        expect(n >= -1, `${t.name}: bad step ${n}`).toBe(true);
        if (n > 0) expect(n).toBeGreaterThanOrEqual(55);
      }
    }
    expect(TRACK_NAMES[0]).toBe("Flappy Rush");
  });

  it("pinned arcade track runs chiptune instrumentation at arcade tempo", () => {
    vi.useFakeTimers();
    const { music } = fixture();
    music.setLevel(0.8);
    music.setMode("menu");
    music.setTrack(0); // Flappy Rush

    const s = internals(music);
    expect(s.isChipTrack).toBe(true);
    expect(s.isTronTrack).toBe(false);
    // Arcade tempo, island colours silent. The chip lead carries the hook —
    // the bell is a shimmer layer above it, never the voice holding the tune
    // (leading with bells on every family made the score read as one bright
    // percussive instrument). Both layers must be audible: the assertion that
    // the bell is *quieter* than the lead is the part that stops the score
    // drifting back to bell-solo.
    expect(s.bpm).toBe(164);
    expect(s.chipGain.gain.value).toBeGreaterThan(0);
    expect(s.ukeGain.gain.value).toBe(0);
    expect(s.glockGain.gain.value).toBeGreaterThan(0);
    expect(s.glockGain.gain.value).toBeLessThan(s.chipGain.gain.value);
    expect(s.sparkGain.gain.value).toBeGreaterThan(0);

    // Let the sequencer actually run — it must not throw on chip steps.
    const ctx = (music as unknown as { ctx: { currentTime: number } }).ctx;
    for (let i = 0; i < 64; i++) { ctx.currentTime += 0.1; vi.advanceTimersByTime(25); }
    expect(music.trackName).toBe("Flappy Rush");
    music.dispose();
  });

  it("island tracks keep the old instrumentation and biome tempo", () => {
    vi.useFakeTimers();
    const { music } = fixture();
    music.setLevel(0.8);
    music.setMode("menu");
    music.setTrack(10); // Ascent — first island track after the arcade ten

    const s = internals(music);
    expect(s.isChipTrack).toBe(false);
    expect(s.bpm).toBe(132); // bright biome default (upbeat floor)
    expect(s.chipGain.gain.value).toBe(0);
    expect(s.ukeGain.gain.value).toBeGreaterThan(0);
    // The ukulele/whistle carries the tune and the bell shimmers underneath it.
    // The reverse (bells as the loudest voice) is what made the darker biomes —
    // night, crystal, reef — read as glockenspiel solos, so it is pinned here.
    expect(s.glockGain.gain.value).toBeGreaterThan(0);
    expect(s.glockGain.gain.value).toBeLessThan(s.ukeGain.gain.value);
    expect(s.percGain.gain.value).toBeGreaterThan(0);
    music.dispose();
  });

  it("keeps the bells under the lead voice in every biome and mode", () => {
    vi.useFakeTimers();
    const biomes = ["bright", "warm", "airy", "wide", "night", "crystal", "reef", "ember", "canyon"] as const;
    const modes = ["menu", "play", "fever"] as const;
    for (let track = 0; track < TRACKS.length; track++) {
      for (const biome of biomes) {
        const { music } = fixture();
        music.setLevel(0.8);
        music.setBiome(biome);
        music.setTrack(track);
        const s = internals(music);
        for (const mode of modes) {
          music.setMode(mode);
          const lead = Math.max(s.chipGain.gain.value, s.ukeGain.gain.value, s.whistleGain.gain.value);
          // Every layer that plays bells must sit strictly below the tune.
          expect(s.glockGain.gain.value).toBeLessThan(lead);
          expect(s.sparkGain.gain.value).toBeLessThan(lead);
        }
        music.dispose();
      }
    }
  });

  it("shuffling never gets stuck and announces chip track titles", () => {
    vi.useFakeTimers();
    const { music } = fixture();
    const announced = new Set<string>();
    music.setMode("menu");
    music.setLevel(0.8);
    (music as unknown as { onTrackChange?: (n: string) => void }).onTrackChange = (n) => announced.add(n);
    const ctx = (music as unknown as { ctx: { currentTime: number } }).ctx;
    // Run ~40 s of audio: at every tempo in the library (100–170 BPM) that
    // is well past two 8-bar sections, so at least two section flips (and
    // announcements) must happen no matter which track the shuffle opens on.
    for (let i = 0; i < 400; i++) { ctx.currentTime += 0.1; vi.advanceTimersByTime(25); }
    expect(announced.size).toBeGreaterThanOrEqual(2);
    music.dispose();
  });
});
