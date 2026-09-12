import { describe, expect, it, vi } from "vitest";
import { bucket, variant } from "../Experiments";

/**
 * A/B bucketing contract: deterministic and sticky (same device+experiment →
 * same variant every time), uncorrelated across experiments, and exposure
 * logged exactly once per session.
 */
describe("experiment bucketing", () => {
  it("is deterministic: same device+experiment always lands the same bucket", () => {
    const a = bucket("device-1", "exp-a");
    const b = bucket("device-1", "exp-a");
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(100);
  });

  it("splits a population roughly evenly across variants", () => {
    let control = 0;
    for (let i = 0; i < 2000; i++) {
      if (variant(`device-${i}`, "exp-split") === "control") control++;
    }
    // 50/50 split: a 2000-device population should land within ~4% of even.
    expect(control).toBeGreaterThan(880);
    expect(control).toBeLessThan(1120);
  });

  it("salts by experiment id so two experiments don't correlate", () => {
    // A device must not necessarily get the same variant in two experiments.
    let correlated = 0;
    let uncorrelated = 0;
    for (let i = 0; i < 500; i++) {
      const a = variant(`device-${i}`, "exp-1");
      const b = variant(`device-${i}`, "exp-2");
      if (a === b) correlated++;
      else uncorrelated++;
    }
    // With independent salting, both outcomes should be substantial.
    expect(correlated).toBeGreaterThan(150);
    expect(uncorrelated).toBeGreaterThan(150);
  });

  it("logs exposure exactly once per session, per variant", () => {
    const onExpose = vi.fn();
    const v1 = variant("device-x", "exp-once", 50, onExpose);
    const v2 = variant("device-x", "exp-once", 50, onExpose);
    const v3 = variant("device-x", "exp-once", 50, onExpose);
    expect(v2).toBe(v1);
    expect(v3).toBe(v1);
    expect(onExpose).toHaveBeenCalledTimes(1);
    expect(onExpose).toHaveBeenCalledWith(v1);
  });

  it("is sticky across the module (no re-bucketing mid-session)", () => {
    const first = variant("device-y", "exp-sticky");
    for (let i = 0; i < 100; i++) {
      expect(variant("device-y", "exp-sticky")).toBe(first);
    }
  });
});
