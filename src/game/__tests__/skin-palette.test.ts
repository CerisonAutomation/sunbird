import { describe, expect, it } from "vitest";
import { SKINS } from "../Economy";
import { RIVAL_PALETTES, SUNBIRD_PALETTE, skinPalette, sunbirdSVG } from "../Sunbird";

/**
 * Every shop skin now renders as the real bird via skinPalette(). The shop
 * previously faked each one from three CSS divs, so 66 skins drew as blobs
 * while the rest of the game drew the mark.
 */
const HEX = /^#[0-9a-f]{6}$/;

describe("skinPalette", () => {
  it("produces a complete, valid palette for every skin in the catalogue", () => {
    expect(SKINS.length).toBeGreaterThan(50);
    for (const d of SKINS) {
      const p = skinPalette(d);
      for (const [k, v] of Object.entries(p)) {
        expect(v, `${d.id}.${k}`).toMatch(HEX);
      }
    }
  });

  it("carries the skin's own four colours through unchanged", () => {
    for (const d of SKINS) {
      const p = skinPalette(d);
      expect(p.body).toBe(`#${(d.body & 0xffffff).toString(16).padStart(6, "0")}`);
      expect(p.wingNear).toBe(`#${(d.wing & 0xffffff).toString(16).padStart(6, "0")}`);
      expect(p.belly).toBe(`#${(d.belly & 0xffffff).toString(16).padStart(6, "0")}`);
      expect(p.beak).toBe(`#${(d.beak & 0xffffff).toString(16).padStart(6, "0")}`);
    }
  });

  it("has the same slots as the reference and rival palettes, so the silhouette cannot change", () => {
    const keys = Object.keys(SUNBIRD_PALETTE).sort();
    expect(Object.keys(RIVAL_PALETTES[0]!).sort()).toEqual(keys);
    for (const d of SKINS.slice(0, 10)) {
      expect(Object.keys(skinPalette(d)).sort()).toEqual(keys);
    }
  });

  it("shades darker parts darker than the body, never inverted", () => {
    const lum = (h: string) => {
      const n = parseInt(h.slice(1), 16);
      return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    };
    for (const d of SKINS) {
      const p = skinPalette(d);
      expect(lum(p.tailTip), `${d.id} tailTip`).toBeLessThan(lum(p.tail));
      expect(lum(p.tail), `${d.id} tail`).toBeLessThan(lum(p.body));
      expect(lum(p.eye), `${d.id} eye`).toBeLessThan(70);
    }
  });

  it("renders without NaN or undefined for any skin", () => {
    for (const d of SKINS) {
      const svg = sunbirdSVG({ palette: skinPalette(d), width: 64, flap: 0.45 });
      expect(svg).not.toContain("NaN");
      expect(svg).not.toContain("undefined");
    }
  });
});
