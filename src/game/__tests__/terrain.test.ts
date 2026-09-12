import { describe, expect, it } from "vitest";
import { SeededRandom } from "../math";
import { TerrainSystem } from "../TerrainSystem";

/**
 * Terrain / RNG determinism property tests. The live game depends on two
 * invariants that a hand-rolled test can regress silently:
 *  1. The same date-seed produces the same hills *and* the same sunflower
 *     pads, every run — otherwise replays, ghosts and rival AI diverge.
 *  2. Every pad is actually reachable and bouncable (on land, gentle slope),
 *     never buried in the ocean, the ramp, or a cliff face.
 */
describe("SeededRandom determinism", () => {
  it("reproduces the exact sequence for a given seed", () => {
    const a = new SeededRandom("surprises:2026-09-11");
    const b = new SeededRandom("surprises:2026-09-11");
    for (let i = 0; i < 256; i++) expect(a.next()).toBe(b.next());
  });

  it("diverges across seeds", () => {
    const a = new SeededRandom("s1");
    const b = new SeededRandom("s2");
    const as: number[] = [];
    for (let i = 0; i < 32; i++) as.push(a.next());
    let same = 0;
    for (let i = 0; i < 32; i++) if (b.next() === as[i]) same++;
    expect(same).toBeLessThan(4);
  });
});

describe("sunflower bounce-pad determinism", () => {
  // bouncePadAt() matches any x within PAD_RADIUS of a pad, so a naive scan
  // returns the same pad many times. Dedupe by object identity.
  function collectPads(seed: string, maxX = 5000): Array<{ x: number; y: number }> {
    const t = new TerrainSystem(seed);
    const seen = new Set<object>();
    const out: Array<{ x: number; y: number }> = [];
    for (let x = 0; x <= maxX; x++) {
      const pad = t.bouncePadAt(x);
      if (pad && !seen.has(pad)) {
        seen.add(pad);
        out.push({ x: pad.x, y: pad.y });
      }
    }
    t.dispose();
    return out;
  }

  it("same seed → identical pad layout", () => {
    expect(collectPads("2026-09-11")).toEqual(collectPads("2026-09-11"));
  });

  it("different seed → different pad layout", () => {
    expect(collectPads("2026-09-11")).not.toEqual(collectPads("2026-09-12"));
  });

  it("every pad is on land with a gentle, bouncable slope", () => {
    const t = new TerrainSystem("2026-09-11");
    for (const pad of collectPads("2026-09-11", 6000)) {
      expect(t.isOcean(pad.x)).toBe(false);
      expect(Math.abs(t.slopeAt(pad.x))).toBeLessThan(0.42);
      expect(t.heightAt(pad.x)).toBeCloseTo(pad.y, 5);
    }
    t.dispose();
  });

  it("pads respect minimum spacing (no overlapping bounces)", () => {
    const pads = collectPads("2026-09-11", 6000);
    for (let i = 1; i < pads.length; i++) {
      expect(pads[i].x - pads[i - 1].x).toBeGreaterThan(120);
    }
  });
});
