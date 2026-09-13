import { describe, it, expect } from "vitest";
import {
  clamp,
  lerp,
  lerpAngle,
  fbm,
  hash01,
  smoothstep,
  valueNoise,
  SeededRandom,
  dateSeed,
} from "../math";

describe("Math Utilities", () => {
  describe("clamp", () => {
    it("clamps value to range", () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
      expect(clamp(0, 0, 10)).toBe(0);
      expect(clamp(10, 0, 10)).toBe(10);
    });

    it("handles negative ranges", () => {
      expect(clamp(-5, -10, -1)).toBe(-5);
      expect(clamp(-15, -10, -1)).toBe(-10);
      expect(clamp(0, -10, -1)).toBe(-1);
    });
  });

  describe("lerp", () => {
    it("interpolates between values", () => {
      expect(lerp(0, 10, 0)).toBe(0);
      expect(lerp(0, 10, 1)).toBe(10);
      expect(lerp(0, 10, 0.5)).toBe(5);
      expect(lerp(0, 10, 0.25)).toBe(2.5);
    });

    it("handles negative values", () => {
      expect(lerp(-10, 10, 0.5)).toBe(0);
      expect(lerp(-20, -10, 0.5)).toBe(-15);
    });
  });

  describe("lerpAngle", () => {
    it("interpolates angles correctly", () => {
      const result = lerpAngle(0, Math.PI, 0.5);
      expect(result).toBeCloseTo(Math.PI / 2);
    });

    it("handles wrap-around", () => {
      // lerpAngle interpolates between angles, taking the shortest path
      const result = lerpAngle(Math.PI * 1.9, Math.PI * 0.1, 0.5);
      // The result should be equivalent to 0 (2π ≡ 0)
      // Normalize to 0-2π range for comparison
      const normalized = ((result % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      expect(normalized).toBeCloseTo(0, 1);
    });
  });

  describe("smoothstep", () => {
    it("returns 0 below edge0", () => {
      expect(smoothstep(0, 10, -5)).toBe(0);
      expect(smoothstep(0, 10, 0)).toBe(0);
    });

    it("returns 1 above edge1", () => {
      expect(smoothstep(0, 10, 15)).toBe(1);
      expect(smoothstep(0, 10, 10)).toBe(1);
    });

    it("interpolates smoothly", () => {
      const mid = smoothstep(0, 10, 5);
      expect(mid).toBeGreaterThan(0.4);
      expect(mid).toBeLessThan(0.6);
      expect(mid).toBeCloseTo(0.5, 1);
    });
  });

  describe("fbm", () => {
    it("returns a number", () => {
      const result = fbm(0.5, 42, 3);
      expect(typeof result).toBe("number");
      expect(Number.isFinite(result)).toBe(true);
    });

    it("is deterministic with same inputs", () => {
      const r1 = fbm(0.5, 42, 3);
      const r2 = fbm(0.5, 42, 3);
      expect(r1).toBe(r2);
    });

    it("varies with input", () => {
      const r1 = fbm(0.5, 42, 3);
      const r2 = fbm(1.5, 42, 3);
      expect(r1).not.toBe(r2);
    });
  });

  describe("hash01", () => {
    it("returns value between 0 and 1", () => {
      for (let i = 0; i < 100; i++) {
        const result = hash01(i, 42);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThan(1);
      }
    });

    it("is deterministic", () => {
      const h1 = hash01(123, 456);
      const h2 = hash01(123, 456);
      expect(h1).toBe(h2);
    });
  });

  describe("valueNoise", () => {
    it("returns a number", () => {
      const result = valueNoise(0.5, 42);
      expect(typeof result).toBe("number");
      expect(Number.isFinite(result)).toBe(true);
    });

    it("is deterministic", () => {
      const n1 = valueNoise(0.5, 42);
      const n2 = valueNoise(0.5, 42);
      expect(n1).toBe(n2);
    });

    it("returns values roughly between -1 and 1", () => {
      for (let i = 0; i < 100; i++) {
        const result = valueNoise(i * 0.1, 42);
        expect(result).toBeGreaterThan(-1.5);
        expect(result).toBeLessThan(1.5);
      }
    });
  });

  describe("SeededRandom", () => {
    it("produces deterministic sequence", () => {
      const rng1 = new SeededRandom("test-seed");
      const rng2 = new SeededRandom("test-seed");
      const seq1 = Array.from({ length: 10 }, () => rng1.next());
      const seq2 = Array.from({ length: 10 }, () => rng2.next());
      expect(seq1).toEqual(seq2);
    });

    it("next() returns value between 0 and 1", () => {
      const rng = new SeededRandom("test");
      for (let i = 0; i < 100; i++) {
        const val = rng.next();
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThan(1);
      }
    });

    it("range() returns value in range", () => {
      const rng = new SeededRandom("test");
      for (let i = 0; i < 100; i++) {
        const val = rng.range(5, 15);
        expect(val).toBeGreaterThanOrEqual(5);
        expect(val).toBeLessThan(15);
      }
    });

    it("int() returns integer in range", () => {
      const rng = new SeededRandom("test");
      for (let i = 0; i < 100; i++) {
        const val = rng.int(0, 10);
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThan(10);
        expect(Number.isInteger(val)).toBe(true);
      }
    });

    it("different seeds produce different sequences", () => {
      const rng1 = new SeededRandom("seed-1");
      const rng2 = new SeededRandom("seed-2");
      const seq1 = Array.from({ length: 5 }, () => rng1.next());
      const seq2 = Array.from({ length: 5 }, () => rng2.next());
      expect(seq1).not.toEqual(seq2);
    });
  });

  describe("dateSeed", () => {
    it("returns a string", () => {
      const result = dateSeed();
      expect(typeof result).toBe("string");
    });

    it("returns same value on same day", () => {
      const d1 = dateSeed();
      const d2 = dateSeed();
      expect(d1).toBe(d2);
    });

    it("returns YYYY-MM-DD format", () => {
      const result = dateSeed();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
