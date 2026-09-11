import { describe, expect, it } from "vitest";
import { PowerUps } from "../PowerUps";

describe("power-ups", () => {
  it("adds a timed power and ticks it down to zero", () => {
    const p = new PowerUps();
    p.add("magnet");
    expect(p.has("magnet")).toBe(true);
    p.tick(1000);
    expect(p.has("magnet")).toBe(false);
  });

  it("stacking duration is capped at 1.8x base", () => {
    const p = new PowerUps();
    p.add("longglide");
    const base = p.timeLeft("longglide");
    p.add("longglide");
    p.add("longglide");
    expect(p.timeLeft("longglide")).toBeLessThanOrEqual(base * 1.8 + 1e-9);
  });

  it("golden wings implies long glide and magnet", () => {
    const p = new PowerUps();
    p.add("goldenwings");
    expect(p.magnetOn()).toBe(true);
    expect(p.has("longglide")).toBe(true);
    expect(p.coinMult()).toBe(2);
  });

  describe("overcharge (tier II)", () => {
    it("second pickup while live promotes to level 2", () => {
      const p = new PowerUps();
      p.add("wingboost");
      expect(p.level("wingboost")).toBe(1);
      p.add("wingboost");
      expect(p.level("wingboost")).toBe(2);
    });

    it("tier II strengthens the effect", () => {
      const p1 = new PowerUps();
      p1.add("wingboost");
      const p2 = new PowerUps();
      p2.add("wingboost");
      p2.add("wingboost");
      expect(p2.liftMult()).toBeGreaterThan(p1.liftMult());

      const g1 = new PowerUps();
      g1.add("longglide");
      const g2 = new PowerUps();
      g2.add("longglide");
      g2.add("longglide");
      expect(g2.dragMult()).toBeLessThan(g1.dragMult());

      const m = new PowerUps();
      m.add("magnet");
      expect(m.magnetScale()).toBe(1);
      m.add("magnet");
      expect(m.magnetScale()).toBeGreaterThan(1);
    });

    it("overcharged golden wings pays triple coins", () => {
      const p = new PowerUps();
      p.add("goldenwings");
      p.add("goldenwings");
      expect(p.coinMult()).toBe(3);
    });

    it("level resets to 0 when the timer expires", () => {
      const p = new PowerUps();
      p.add("feather");
      p.add("feather");
      expect(p.level("feather")).toBe(2);
      p.tick(1000);
      expect(p.level("feather")).toBe(0);
      // A fresh pickup after expiry starts back at tier 1.
      p.add("feather");
      expect(p.level("feather")).toBe(1);
    });

    it("view() reports the level for the HUD badge", () => {
      const p = new PowerUps();
      p.add("magnet");
      p.add("magnet");
      const v = p.view().find((x) => x.kind === "magnet")!;
      expect(v.level).toBe(2);
    });
  });

  it("reset clears levels along with timers", () => {
    const p = new PowerUps();
    p.add("magnet");
    p.add("magnet");
    p.reset();
    p.add("magnet");
    expect(p.level("magnet")).toBe(1);
  });
});
