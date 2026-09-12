import { beforeEach, describe, expect, it } from "vitest";
import { PowerUps } from "../PowerUps";

describe("PowerUps", () => {
  let p: PowerUps;

  beforeEach(() => {
    p = new PowerUps();
  });

  it("starts empty with neutral multipliers", () => {
    expect(p.view()).toHaveLength(0);
    expect(p.dragMult()).toBe(1);
    expect(p.liftMult()).toBe(1);
    expect(p.coinMult()).toBe(1);
    expect(p.magnetOn()).toBe(false);
    expect(p.featherOn()).toBe(false);
    expect(p.boostOn()).toBe(false);
    expect(p.cloudBoostOn()).toBe(false);
  });

  it("grants a timed power and decays it", () => {
    const d = p.add("longglide");
    expect(d).toBeGreaterThan(0);
    expect(p.has("longglide")).toBe(true);
    expect(p.dragMult()).toBeCloseTo(0.42, 2);
    p.tick(d / 2);
    expect(p.timeLeft("longglide")).toBeCloseTo(d / 2, 5);
    p.tick(d);
    expect(p.has("longglide")).toBe(false);
    expect(p.dragMult()).toBe(1);
  });

  it("caps a repeated pickup at 1.8x its duration", () => {
    const d = p.add("wingboost");
    p.add("wingboost");
    p.add("wingboost");
    expect(p.timeLeft("wingboost")).toBeCloseTo(d * 1.8, 5);
  });

  it("golden wings implies its lesser effects", () => {
    p.add("goldenwings");
    expect(p.has("longglide")).toBe(true);
    expect(p.has("magnet")).toBe(true);
    expect(p.magnetOn()).toBe(true);
    expect(p.featherOn()).toBe(true);
    expect(p.coinMult()).toBe(2);
    expect(p.dragMult()).toBeLessThan(0.5);
    expect(p.liftMult()).toBeGreaterThan(1);
  });

  it("unknown pickups are ignored", () => {
    expect(p.add("boost" as never)).toBe(0);
    expect(p.view()).toHaveLength(0);
  });

  it("view returns active powers sorted by time remaining", () => {
    p.add("magnet");
    p.add("longglide");
    p.add("rocket");
    p.add("feather");
    p.add("wingboost");
    p.add("cloudboost");
    const view = p.view();
    expect(view.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < view.length; i++) {
      expect(view[i - 1]!.time).toBeGreaterThanOrEqual(view[i]!.time);
    }
    expect(view[0]!.label.length).toBeGreaterThan(0);
  });
});
