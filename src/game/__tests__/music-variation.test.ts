import { describe, expect, it } from "vitest";
import { TRACKS, varyMelody, wantsTurnaround } from "../Music";

/**
 * The score used to play each 8-bar tune note-for-note identically on every
 * pass, which is what made it read as a dead loop. These tests measure the
 * variation rather than asserting it "sounds better" — repetition is
 * countable, taste is not.
 */

/** Render one full 64-slot pass of a track for a given phrase index. */
function renderPass(mel: number[], cycle: number): number[] {
  const out: number[] = [];
  for (let bar = 0; bar < 8; bar++) {
    for (let step = 0; step < 8; step++) {
      out.push(varyMelody(mel[bar * 8 + step] ?? 0, cycle, bar, step));
    }
  }
  return out;
}

const key = (notes: number[]): string => notes.join(",");

describe("varyMelody", () => {
  it("leaves the first pass of every tune exactly as written", () => {
    // The tune must stay recognisable: cycle 0 is the composition itself.
    for (const track of TRACKS) {
      expect(renderPass(track.mel, 0)).toEqual(track.mel.slice(0, 64));
    }
  });

  it("never invents a note where the tune rests or sustains", () => {
    // 0 = rest, -1 = sustain. Turning either into a pitch would make the
    // variation read as clutter rather than phrasing.
    for (const track of TRACKS) {
      for (let cycle = 0; cycle < 9; cycle++) {
        for (let bar = 0; bar < 8; bar++) {
          for (let step = 0; step < 8; step++) {
            const n = track.mel[bar * 8 + step] ?? 0;
            if (n <= 0) expect(varyMelody(n, cycle, bar, step)).toBe(n);
          }
        }
      }
    }
  });

  it("only ever moves a note by an octave, so the harmony still fits", () => {
    for (const track of TRACKS) {
      for (let cycle = 0; cycle < 12; cycle++) {
        for (let i = 0; i < 64; i++) {
          const original = track.mel[i] ?? 0;
          const varied = varyMelody(original, cycle, (i / 8) | 0, i % 8);
          if (original <= 0) continue;
          expect([0, 12, -12]).toContain(varied - original);
        }
      }
    }
  });

  it("actually breaks the repetition — multiple distinct passes per tune", () => {
    // The whole point. If this collapses to 1, the variation is dead code and
    // the score is a loop again.
    for (const track of TRACKS) {
      const versions = new Set<string>();
      for (let cycle = 0; cycle < 6; cycle++) versions.add(key(renderPass(track.mel, cycle)));
      expect(versions.size).toBeGreaterThan(1);
    }
  });

  it("cycles back to the original instead of drifting forever", () => {
    // Three-phrase period: after 3 passes the tune returns, so long sessions
    // stay varied without the melody wandering away from itself.
    for (const track of TRACKS) {
      expect(key(renderPass(track.mel, 3))).toBe(key(renderPass(track.mel, 0)));
      expect(key(renderPass(track.mel, 4))).toBe(key(renderPass(track.mel, 1)));
    }
  });

  it("handles a negative cycle without going out of range", () => {
    // Defensive: a negative phrase index must still land in a valid bucket,
    // never produce NaN or an undefined variation. ((-1 % 3) + 3) % 3 === 2,
    // so cycle -1 behaves like the third pass.
    expect(varyMelody(72, -1, 3, 4)).toBe(60); // variation 2: tail dropped
    expect(varyMelody(72, -1, 1, 2)).toBe(72); // variation 2 does not lift
    expect(varyMelody(72, -3, 0, 0)).toBe(72); // -3 normalises to variation 0
    for (const cycle of [-9, -5, -1, 0, 1, 7]) {
      for (let i = 0; i < 64; i++) {
        const n = varyMelody(72, cycle, (i / 8) | 0, i % 8);
        expect(Number.isFinite(n)).toBe(true);
      }
    }
  });
});

describe("wantsTurnaround", () => {
  it("fires only in the last bar, only on alternating passes", () => {
    for (let bar = 0; bar < 8; bar++) {
      for (let step = 0; step < 8; step++) {
        const fired = wantsTurnaround(0, 1, bar, step);
        if (bar !== 7) expect(fired).toBe(false);
        else expect(fired).toBe(step % 2 === 0);
      }
    }
  });

  it("never fills over a sustained note", () => {
    // -1 means the previous note is still ringing; a fill there would clash.
    for (let cycle = 0; cycle < 6; cycle++) {
      for (let step = 0; step < 8; step++) {
        expect(wantsTurnaround(-1, cycle, 7, step)).toBe(false);
      }
    }
  });

  it("stays silent on even passes so the fill is an event, not a texture", () => {
    for (let step = 0; step < 8; step++) expect(wantsTurnaround(0, 2, 7, step)).toBe(false);
    expect(wantsTurnaround(0, 1, 7, 0)).toBe(true);
  });
});

describe("the score as a whole", () => {
  it("every track has a full 8-bar melody", () => {
    for (const track of TRACKS) {
      expect(track.mel.length).toBe(64);
      expect(track.prog.length).toBe(8);
      expect(track.name.length).toBeGreaterThan(0);
    }
  });

  it("has enough distinct tunes that a session does not exhaust them quickly", () => {
    const melodies = new Set(TRACKS.map((t) => key(t.mel)));
    expect(TRACKS.length).toBeGreaterThanOrEqual(10);
    // No two tracks share a melody.
    expect(melodies.size).toBe(TRACKS.length);
  });
});
