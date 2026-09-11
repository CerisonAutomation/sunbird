import { describe, expect, it } from "vitest";
import { BIG_LAUNCH_QUIPS, SLEEP_QUIPS, SPLASH_QUIPS, SurpriseEngine, pickSurprise, quip } from "../Surprises";

describe("surprise engine", () => {
  it("never fires early in a run", () => {
    const e = new SurpriseEngine();
    e.reset();
    for (let t = 0; t < 200; t++) {
      expect(e.tick(0.5, 100, true, () => 0)).toBeNull(); // rng=0 would always fire if allowed
    }
  });

  it("fires at most once per cooldown window even with a hot rng", () => {
    const e = new SurpriseEngine();
    e.reset();
    let fired = 0;
    for (let t = 0; t < 240; t++) {
      if (e.tick(0.25, 5000, true, () => 0)) fired++;
    }
    // 60s simulated: warm-up (18s) + one fire + 67.5s cooldown → exactly 1
    expect(fired).toBe(1);
  });

  it("never fires while grounded or swimming", () => {
    const e = new SurpriseEngine();
    e.reset();
    for (let t = 0; t < 400; t++) expect(e.tick(0.5, 9999, false, () => 0)).toBeNull();
  });

  it("every surprise in the pool is positive or neutral", () => {
    for (let i = 0; i < 50; i++) {
      const s = pickSurprise(() => i / 50);
      expect(s.coins).toBeGreaterThanOrEqual(0);
      expect(s.feverSeconds).toBeGreaterThanOrEqual(0);
      expect(s.toast.length).toBeGreaterThan(4);
    }
  });

  it("quips are deterministic and in-pool", () => {
    expect(quip(SPLASH_QUIPS, 4)).toBe(quip(SPLASH_QUIPS, 4));
    expect(SPLASH_QUIPS).toContain(quip(SPLASH_QUIPS, 7));
    expect(SLEEP_QUIPS).toContain(quip(SLEEP_QUIPS, 123));
    expect(BIG_LAUNCH_QUIPS).toContain(quip(BIG_LAUNCH_QUIPS, 999));
  });
});
