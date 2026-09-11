import { describe, expect, it } from "vitest";
import { Telemetry } from "../Telemetry";
import { BIG_LAUNCH_QUIPS, SLEEP_QUIPS, quip } from "../Surprises";

describe("telemetry", () => {
  it("buffers events and keeps only the last 100", () => {
    const t = new Telemetry();
    for (let i = 0; i < 120; i++) t.track("run_end", { mode: "daytrip", distance: i });
    expect(t.recent().length).toBe(100);
    expect(t.recent()[0]!.props.distance).toBe(20);
  });

  it("flush is a safe no-op with no backend configured", () => {
    const t = new Telemetry();
    t.bindDevice("d-test");
    t.track("run_end", { mode: "daytrip", distance: 1234 });
    // VITE_MP_URL is unset under vitest — flush must not throw or fetch.
    expect(() => t.flush()).not.toThrow();
  });

  it("records structured props verbatim on the local bus", () => {
    const t = new Telemetry();
    t.track("zenith", { alt: 812 });
    const last = t.recent().at(-1)!;
    expect(last.name).toBe("zenith");
    expect(last.props.alt).toBe(812);
  });
});

describe("comedy voice", () => {
  it("expanded quip pools stay deterministic", () => {
    expect(SLEEP_QUIPS.length).toBeGreaterThanOrEqual(8);
    expect(BIG_LAUNCH_QUIPS.length).toBeGreaterThanOrEqual(8);
    expect(quip(SLEEP_QUIPS, 7)).toBe(quip(SLEEP_QUIPS, 7));
    expect(new Set(SLEEP_QUIPS).size).toBe(SLEEP_QUIPS.length);
    expect(new Set(BIG_LAUNCH_QUIPS).size).toBe(BIG_LAUNCH_QUIPS.length);
  });
});
