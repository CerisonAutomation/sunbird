import { describe, expect, it } from "vitest";
import { TerrainSystem } from "../TerrainSystem";

/**
 * Whole-map integrity.
 *
 * `physcheck` samples curvature over x in [100, 6000] only, which is a small
 * fraction of a flight. Probing the full range found |curvature| up to 71 and
 * single-sample height jumps of ~86 — but every one of them is a coastline,
 * where land at ~98 m drops straight into ocean. Those are intentional.
 *
 * So the invariant worth pinning is not "curvature is low everywhere" (it
 * isn't, by design) but "the only discontinuities in the map are coastlines".
 * An inland cliff would be a real bug that pops the bird, and nothing else in
 * the suite would catch it.
 */
const SCAN_FROM = -500;
const SCAN_TO = 40000;
const STEP = 0.5;
/** A height change over one STEP this large cannot be a slope; it is a cliff. */
const CLIFF = 20;

function scan(seed: string) {
  const t = new TerrainSystem(seed);
  let nonFinite = 0;
  let coastTransitions = 0;
  let inlandDiscontinuities = 0;
  const inland: number[] = [];
  let prev = t.heightAt(SCAN_FROM);
  let prevOcean = t.isOcean(SCAN_FROM);
  for (let x = SCAN_FROM + STEP; x < SCAN_TO; x += STEP) {
    const h = t.heightAt(x);
    const slope = t.slopeAt(x);
    const curv = t.curvatureAt(x);
    const ocean = t.isOcean(x);
    if (!Number.isFinite(h) || !Number.isFinite(slope) || !Number.isFinite(curv)) nonFinite++;
    if (Math.abs(h - prev) > CLIFF) {
      if (ocean !== prevOcean) coastTransitions++;
      else {
        inlandDiscontinuities++;
        inland.push(x);
      }
    }
    prev = h;
    prevOcean = ocean;
  }
  return { nonFinite, coastTransitions, inlandDiscontinuities, inland };
}

describe("terrain integrity across the whole map", () => {
  it("never returns a non-finite height, slope or curvature", () => {
    expect(scan("2025-01-01").nonFinite).toBe(0);
  });

  it("has no inland discontinuities — every cliff is a coastline", () => {
    const r = scan("2025-01-01");
    expect(r.inlandDiscontinuities, `inland cliffs at x=${r.inland.slice(0, 5).join(", ")}`).toBe(0);
    // Sanity: the map does have coasts, so the check above is not vacuous.
    expect(r.coastTransitions).toBeGreaterThan(10);
  });

  it("holds for other seeds, not just the one that was hand-checked", () => {
    for (const seed of ["a-different-seed", "2026-09-13", "zzz", "1"]) {
      const r = scan(seed);
      expect(r.nonFinite, `${seed}: non-finite`).toBe(0);
      expect(r.inlandDiscontinuities, `${seed}: inland cliff at ${r.inland[0]}`).toBe(0);
      expect(r.coastTransitions, `${seed}: no coasts at all`).toBeGreaterThan(10);
    }
  });
});
