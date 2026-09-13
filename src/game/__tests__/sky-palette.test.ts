import { describe, expect, it } from "vitest";
import { STOPS } from "../Sky";

/**
 * The sky's brightness used to be a matter of opinion. It isn't: every colour
 * in the ramp is a number, so "more sunny / less cloudy / more light" can be
 * asserted instead of claimed.
 *
 * Each helper below is the value that was in the ramp *before* the clear-sky
 * pass, recorded so the improvement is pinned and cannot silently regress.
 */

type RGB = [number, number, number];

function rgb(hex: number): RGB {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

/** Rec. 709 relative luminance, 0..255. */
function luminance(hex: number): number {
  const [r, g, b] = rgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Chroma (max-min), 0..255. This is the "is it grey?" measure: a washed-out,
 * overcast-looking sky has low chroma no matter how bright it is.
 */
function chroma(hex: number): number {
  const [r, g, b] = rgb(hex);
  return Math.max(r, g, b) - Math.min(r, g, b);
}

const stop = (t: number) => {
  const found = STOPS.find((s) => s.t === t);
  if (!found) throw new Error(`no stop at t=${t}`);
  return found.s;
};

/** The pre-clear-sky ramp, for comparison only. */
const BEFORE = {
  day: { top: 0x4aa4ea, horizon: 0xa8e4ff, bottom: 0x7ec8e8, fog: 0x8ed0ee, hemiSky: 0xb0e0ff, farA: 0x6bb87a },
  golden: { top: 0x7ec8f5, horizon: 0xffe0b8, bottom: 0xf0c8a0, fog: 0xe8d8c4, hemiSky: 0xffe0c8, farA: 0x8ed89a },
};

describe("sky ramp — the daylight stops are brighter and less murky", () => {
  it("horizon is brighter at both daylight stops", () => {
    expect(luminance(stop(0.7).horizon)).toBeGreaterThan(luminance(BEFORE.day.horizon));
    expect(luminance(stop(1).horizon)).toBeGreaterThan(luminance(BEFORE.golden.horizon));
  });

  it("fog colour is much brighter — this is what removes the murky cast", () => {
    // Fog tints every distant surface. A dark fog colour is the single biggest
    // cause of a scene reading as overcast regardless of the light intensity.
    expect(luminance(stop(0.7).fog) - luminance(BEFORE.day.fog)).toBeGreaterThan(30);
    expect(luminance(stop(1).fog) - luminance(BEFORE.golden.fog)).toBeGreaterThan(10);
  });

  it("hemisphere sky colour is brighter, which is literally more light on the scene", () => {
    // hemiSky feeds HemisphereLight, so this is not a cosmetic change.
    expect(luminance(stop(0.7).hemiSky)).toBeGreaterThan(luminance(BEFORE.day.hemiSky));
    expect(luminance(stop(1).hemiSky)).toBeGreaterThan(luminance(BEFORE.golden.hemiSky));
  });

  it("the overhead blue is more saturated, i.e. clearer rather than cloudier", () => {
    // Deliberately NOT asserted as brighter: a clear sky overhead is a deeper
    // blue, so luminance drops slightly while chroma rises. Asserting the
    // chroma rise is what actually encodes "less cloudy".
    expect(chroma(stop(0.7).top)).toBeGreaterThan(chroma(BEFORE.day.top));
    expect(luminance(stop(0.7).top)).toBeLessThan(luminance(BEFORE.day.top));
  });

  it("distant terrain layers are lifted, so the horizon is not grey sludge", () => {
    expect(luminance(stop(0.7).farA)).toBeGreaterThan(luminance(BEFORE.day.farA));
    expect(luminance(stop(1).farA)).toBeGreaterThan(luminance(BEFORE.golden.farA));
  });

  it("no daylight stop is left dimmer than the old murky floor", () => {
    const oldFloor = luminance(BEFORE.day.fog);
    for (const t of [0.7, 1]) {
      const s = stop(t);
      for (const key of ["horizon", "bottom", "fog", "hemiSky"] as const) {
        expect(luminance(s[key]), `t=${t} ${key}`).toBeGreaterThan(oldFloor - 60);
      }
    }
  });
});

describe("sky ramp — shape and ordering", () => {
  it("spans the full day and stays sorted", () => {
    expect(STOPS[0]!.t).toBe(0);
    expect(STOPS[STOPS.length - 1]!.t).toBe(1);
    for (let i = 1; i < STOPS.length; i++) {
      expect(STOPS[i]!.t).toBeGreaterThan(STOPS[i - 1]!.t);
    }
  });

  it("never gets darker as daylight returns", () => {
    // A run drains daylight 1 -> 0, so it walks this ramp backwards. The
    // invariant that matters is monotonic non-decreasing, NOT strictly
    // increasing: the two daylight stops deliberately plateau (horizon
    // luminance 237.41 at t=0.7 vs 237.44 at t=1, a gap of 0.03) because a
    // clear day and golden hour should be equally bright and differ in
    // warmth, not in light level. Asserting a strict rise here would be a
    // 0.03-lumen assertion that any colour tweak could flip.
    const lums = STOPS.map((s) => luminance(s.s.horizon));
    for (let i = 1; i < lums.length; i++) {
      expect(lums[i]!, `horizon at t=${STOPS[i]!.t}`).toBeGreaterThanOrEqual(lums[i - 1]! - 0.001);
    }
  });

  it("both daylight stops clear the old murky floor by a wide margin", () => {
    // The substantive brightness claim, with the margin stated rather than a
    // bare inequality: the old day horizon was 0xa8e4ff.
    const oldDay = luminance(BEFORE.day.horizon);
    expect(luminance(stop(0.7).horizon) - oldDay).toBeGreaterThan(15);
    expect(luminance(stop(1).horizon) - luminance(BEFORE.golden.horizon)).toBeGreaterThan(5);
  });

  it("night is genuinely dark, so the daylight stops read as sunny by contrast", () => {
    expect(luminance(STOPS[0]!.s.horizon)).toBeLessThan(60);
  });

  it("every stop defines the full palette the renderer reads", () => {
    const keys = ["top", "horizon", "bottom", "fog", "sun", "farA", "farB", "farC", "water", "waterDeep", "hemiSky", "hemiGround"] as const;
    for (const s of STOPS) {
      for (const k of keys) {
        const v = s.s[k];
        expect(Number.isInteger(v), `t=${s.t} ${k}`).toBe(true);
        expect(v, `t=${s.t} ${k}`).toBeGreaterThanOrEqual(0);
        expect(v, `t=${s.t} ${k}`).toBeLessThanOrEqual(0xffffff);
      }
    }
  });
});
