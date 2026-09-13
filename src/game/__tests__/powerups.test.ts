import { describe, expect, it, beforeEach } from "vitest";
import { PowerUps } from "../PowerUps";

describe("PowerUps", () => {
  let p: PowerUps;

  beforeEach(() => {
    p = new PowerUps();
  });

  it("starts empty", () => {
    expect(p.has("wingboost")).toBe(false);
    expect(p.view()).toHaveLength(0);
  });

  it("add() arms a timed power-up", () => {
    const d = p.add("wingboost");
    expect(d).toBeGreaterThan(0);
    expect(p.has("wingboost")).toBe(true);
  });

  it("tick() drains timers", () => {
    p.add("wingboost");
    p.tick(1000);
    expect(p.has("wingboost")).toBe(false);
  });

  it("reset() clears all timers and shield", () => {
    p.add("magnet");
    p.shield = 2;
    p.reset();
    expect(p.has("magnet")).toBe(false);
    expect(p.shield).toBe(0);
  });

  it("magnetOn() true while magnet is active", () => {
    expect(p.magnetOn()).toBe(false);
    p.add("magnet");
    expect(p.magnetOn()).toBe(true);
  });

  it("liftMult() > 1 with wingboost", () => {
    const base = p.liftMult();
    p.add("wingboost");
    expect(p.liftMult()).toBeGreaterThan(base);
  });

  it("dragMult() < 1 with longglide", () => {
    const base = p.dragMult();
    p.add("longglide");
    expect(p.dragMult()).toBeLessThan(base);
  });

  it("coinMult() > 1 with goldenwings", () => {
    const base = p.coinMult();
    p.add("goldenwings");
    expect(p.coinMult()).toBeGreaterThan(base);
  });

  it("view() includes label for every active power", () => {
    p.add("magnet");
    p.add("wingboost");
    const view = p.view();
    for (const v of view) {
      expect(v.label.length).toBeGreaterThan(0);
    }
    expect(view[0]!.label.length).toBeGreaterThan(0);
  });

  describe("overcharge (tier II)", () => {
    it("second pickup while live promotes to level 2", () => {
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
      p.add("goldenwings");
      p.add("goldenwings");
      expect(p.coinMult()).toBe(3);
    });

    it("level resets to 0 when the timer expires", () => {
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
      p.add("magnet");
      p.add("magnet");
      const v = p.view().find((x) => x.kind === "magnet")!;
      expect(v.level).toBe(2);
    });
  });

  it("reset clears levels along with timers", () => {
    p.add("magnet");
    p.add("magnet");
    p.reset();
    p.add("magnet");
    expect(p.level("magnet")).toBe(1);
  });
});
