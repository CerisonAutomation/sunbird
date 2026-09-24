import { describe, expect, it } from "vitest";
import { MOMENT_KINDS, MOMENTS, MomentLedger, momentNextAction, momentRepeatGap, momentShouldReact } from "../Moments";

describe("moment reaction table", () => {
  it("defines a complete bundle for every kind", () => {
    for (const kind of MOMENT_KINDS) {
      const def = MOMENTS[kind];
      expect(def).toBeDefined();
      expect(def.kind).toBe(kind);
      expect(def.icon.length).toBeGreaterThan(0);
      expect(def.label.length).toBeGreaterThan(0);
      // i18n keys follow the documented namespace so the barrel can be audited.
      expect(def.key).toBe(`moments.${kind}`);
      expect(def.cardKey).toBe(`moments.${kind}.card`);
      expect(def.popup).toBeTruthy();
      expect(def.tone).toBeTruthy();
      expect(def.shout.length).toBeGreaterThan(0);
      expect(def.next.title.length).toBeGreaterThan(0);
      expect(def.next.tip.length).toBeGreaterThan(0);
    }
  });

  it("writes a readable card line for one and for many", () => {
    for (const kind of MOMENT_KINDS) {
      for (const n of [1, 2, 7]) {
        const line = MOMENTS[kind].cardLine(n);
        expect(typeof line).toBe("string");
        expect(line.length).toBeGreaterThan(3);
        expect(line).not.toContain("NaN");
        expect(line).not.toContain("undefined");
      }
    }
  });

  it("keeps shout text short enough for a popup", () => {
    for (const kind of MOMENT_KINDS) expect(MOMENTS[kind].shout.length).toBeLessThanOrEqual(10);
  });
});

describe("MomentLedger", () => {
  it("counts occurrences and reports the new total", () => {
    const led = new MomentLedger();
    expect(led.record("bonk")).toBe(1);
    expect(led.record("bonk")).toBe(2);
    expect(led.count("bonk")).toBe(2);
    expect(led.count("splash")).toBe(0);
    expect(led.length).toBe(2);
  });

  it("starts with an empty recap so the card can skip the strip", () => {
    const led = new MomentLedger();
    expect(led.recapLine()).toBe("");
    expect(led.tally()).toEqual([]);
    expect(led.headline()).toBeNull();
    expect(led.toJSON()).toEqual({});
  });

  it("orders the tally by frequency, then by chronology", () => {
    const led = new MomentLedger();
    led.record("splash");
    led.record("bonk");
    led.record("bonk");
    led.record("splash");
    led.record("record");
    const rows = led.tally();
    expect(rows.map((r) => r.kind)).toEqual(["splash", "bonk", "record"]);
    expect(rows[0].count).toBe(2);
    expect(rows[0].icon).toBe(MOMENTS.splash.icon);
    expect(rows[0].key).toBe("moments.splash");
  });

  it("caps the tally when asked", () => {
    const led = new MomentLedger();
    for (const kind of MOMENT_KINDS) led.record(kind);
    expect(led.tally(3)).toHaveLength(3);
    expect(led.tally(0)).toHaveLength(MOMENT_KINDS.length);
  });

  it("names the dominant moment as the headline", () => {
    const led = new MomentLedger();
    led.record("perfect");
    led.record("bonk");
    led.record("bonk");
    expect(led.headline()).toBe("bonk");
    expect(momentNextAction(led)).toEqual(MOMENTS.bonk.next);
  });

  it("has no headline and no CTA for an uneventful flight", () => {
    expect(momentNextAction(new MomentLedger())).toBeNull();
  });

  it("emits only fired kinds for telemetry", () => {
    const led = new MomentLedger();
    led.record("sleep");
    led.record("sleep");
    expect(led.toJSON()).toEqual({ sleep: 2 });
  });

  it("keeps session memory across run resets", () => {
    const led = new MomentLedger();
    expect(led.isFirstEver("boing")).toBe(true);
    led.record("boing");
    led.record("boing");
    expect(led.isFirstEver("boing")).toBe(false);
    led.resetRun();
    expect(led.length).toBe(0);
    expect(led.recapLine()).toBe("");
    // "First funny moment" must never be reported twice in one session.
    expect(led.isFirstEver("boing")).toBe(false);
    led.resetAll();
    expect(led.isFirstEver("boing")).toBe(true);
  });

  it("writes a recap line listing the loudest moments", () => {
    const led = new MomentLedger();
    led.record("bonk");
    led.record("bonk");
    led.record("record");
    expect(led.recapLine()).toContain("2 BONK");
    expect(led.recapLine()).toContain("1 RECORD");
    expect(led.recapLine().split("\u00b7")).toHaveLength(2);
  });
});

describe("repeat throttle", () => {
  it("suppresses same-frame repeats", () => {
    expect(momentShouldReact(0, 0.1)).toBe(false);
    expect(momentShouldReact(1, 0.29)).toBe(false);
    expect(momentShouldReact(1, 0.3)).toBe(true);
  });

  it("always lets the first three land", () => {
    for (const n of [0, 1, 2]) expect(momentShouldReact(n, 0.31)).toBe(true);
  });

  it("slows the cadence as a run gets chaotic", () => {
    const gaps = [0, 3, 7, 15].map((n) => momentRepeatGap(n));
    for (let i = 1; i < gaps.length; i += 1) expect(gaps[i]).toBeGreaterThan(gaps[i - 1]);
    expect(momentShouldReact(7, 1)).toBe(false);
    expect(momentShouldReact(7, 2.3)).toBe(true);
    expect(momentShouldReact(15, 4.9)).toBe(false);
    expect(momentShouldReact(15, 5)).toBe(true);
  });

  it("caps the count a single stall can produce", () => {
    const led = new MomentLedger();
    let clock = 0;
    let last = Number.NEGATIVE_INFINITY;
    // 10 s of stalling sampled at 60 Hz, exactly what a beached bird does.
    for (let frame = 0; frame < 600; frame += 1) {
      clock += 1 / 60;
      if (momentShouldReact(led.count("panic"), clock - last)) {
        led.record("panic");
        last = clock;
      }
    }
    expect(led.count("panic")).toBeGreaterThan(3);
    expect(led.count("panic")).toBeLessThan(25);
  });
});
