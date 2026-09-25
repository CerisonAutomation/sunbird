import { describe, expect, it } from "vitest";
import { buildCtx } from "../src/server.js";
import { V1_ROUTES } from "../src/http/api.js";
import type { Ctx } from "../src/core/ctx.js";
import type { Route } from "../src/http/router.js";
import type { FunnelReport } from "../src/telemetry/TelemetryService.js";

/**
 * The first-run funnel, answered from anonymous counters.
 *
 * The question this exists for is the one every other retention decision
 * depends on — *where do players drop off* — and until now nothing in the repo
 * could answer it: `Funnel.ts` marked the stages, the client tracked them, and
 * the beacon threw the position away because it only carried `{k, mode, km}`.
 *
 * The fix is deliberately narrow. Two funnel events now also carry a stage id
 * and its index in the fixed path, and the sink folds those into per-stage
 * counts. There are no session ids here, no timestamps and no ordering
 * information beyond the stage's own index, so a funnel can be reported without
 * this service becoming a tracking system — which is the line its own header
 * comment draws.
 */

const PATH: [string, number][] = [
  ["boot", 0],
  ["first_input", 1],
  ["first_flight", 2],
  ["first_reward", 3],
  ["first_moment", 4],
  ["first_death", 5],
  ["first_retry", 6],
  ["second_run", 7],
];

function route(method: string, path: string): Route {
  const r = V1_ROUTES.find((rt) => rt.method === method && rt.re.test(path));
  if (!r) throw new Error(`no route for ${method} ${path}`);
  return r;
}

function post(ctx: Ctx, body: Record<string, unknown>): { accepted: number; keys: number } {
  return route("POST", "/mp/v1/telemetry").handler(ctx, {}, new URLSearchParams(), body, "") as {
    accepted: number;
    keys: number;
  };
}

function funnel(ctx: Ctx): FunnelReport {
  return route("GET", "/mp/v1/telemetry/funnel").handler(ctx, {}, new URLSearchParams(), {}, "") as FunnelReport;
}

/** One anonymous session: walks `depth` stages, then reports where it stopped. */
function session(ctx: Ctx, device: string, depth: number): void {
  const events: Record<string, unknown>[] = [];
  for (let i = 0; i < depth; i += 1) events.push({ k: "funnel_stage", st: PATH[i]![0], si: PATH[i]![1] });
  const last = PATH[Math.max(0, depth - 1)]!;
  events.push({ k: "funnel_summary", st: last[0], si: last[1] });
  post(ctx, { deviceId: device, events });
}

/** 40 sessions: ten went all the way, six never got past the boot screen. */
function cohort(ctx: Ctx): void {
  const depths = [...Array(10).fill(8), ...Array(8).fill(6), ...Array(7).fill(4), ...Array(5).fill(3), ...Array(4).fill(2), ...Array(6).fill(1)];
  depths.forEach((depth, i) => session(ctx, `device-${i}`, depth as number));
}

describe("funnel aggregation", () => {
  it("answers 'where do players drop off' from counts alone", () => {
    const ctx = buildCtx();
    cohort(ctx);
    const report = funnel(ctx);

    expect(report.steps.map((s) => s.stage)).toEqual(PATH.map(([stage]) => stage));
    expect(report.steps.map((s) => s.reached)).toEqual([40, 34, 30, 25, 18, 18, 10, 10]);
    expect(report.entered).toBe(40);
    expect(report.devices).toBe(40);
    // Every session reports exactly one stall — the stage it got to.
    expect(report.stalled).toBe(40);
    expect(report.steps.map((s) => s.stalled)).toEqual([6, 4, 5, 7, 0, 8, 0, 10]);

    // Step-to-step conversion, rounded to three places: 34/40, 30/34, …
    expect(report.steps[0]!.conversion).toBeNull();
    expect(report.steps[1]!.conversion).toBe(0.85);
    expect(report.steps[2]!.conversion).toBe(0.882);
    expect(report.steps[6]!.conversion).toBe(0.556);
    expect(report.steps[5]!.conversion).toBe(1);

    // The one number a playtest debrief actually quotes.
    expect(report.worst).toEqual({ stage: "first_death->first_retry", dropOff: 0.444, reached: 10, of: 18 });
  });

  it("is empty, not wrong, before any session has arrived", () => {
    const ctx = buildCtx();
    expect(funnel(ctx)).toEqual({ devices: 0, entered: 0, steps: [], worst: null, stalled: 0 });
  });

  it("orders by the index the client sends, not by arrival order", () => {
    const ctx = buildCtx();
    // A beacon that reports the end of the path first must not produce a
    // funnel that reads as "second_run -> boot".
    post(ctx, {
      deviceId: "d",
      events: [
        { k: "funnel_stage", st: "second_run", si: 7 },
        { k: "funnel_stage", st: "first_flight", si: 2 },
        { k: "funnel_stage", st: "boot", si: 0 },
      ],
    });
    expect(funnel(ctx).steps.map((s) => s.stage)).toEqual(["boot", "first_flight", "second_run"]);
    expect(funnel(ctx).steps.map((s) => s.step)).toEqual([0, 2, 7]);
  });

  it("puts a stage with no index last instead of guessing where it belongs", () => {
    const ctx = buildCtx();
    post(ctx, { deviceId: "d", events: [{ k: "funnel_stage", st: "boot", si: 0 }, { k: "funnel_stage", st: "mystery_stage" }] });
    expect(funnel(ctx).steps.map((s) => s.stage)).toEqual(["boot", "mystery_stage"]);
  });

  it("reports no rate at all below the sample floor", () => {
    const ctx = buildCtx();
    // Three sessions: any percentage off a base of three is noise, and a noise
    // number in an ops view gets quoted in a design meeting.
    session(ctx, "a", 3);
    session(ctx, "b", 2);
    session(ctx, "c", 1);
    const report = funnel(ctx);
    expect(report.steps.map((s) => s.reached)).toEqual([3, 2, 1]);
    for (const step of report.steps) expect(step.conversion).toBeNull();
    expect(report.worst).toBeNull();
  });

  it("takes a funnel position from the two funnel events and nobody else", () => {
    const ctx = buildCtx();
    post(ctx, {
      deviceId: "d",
      events: [
        { k: "run_end", st: "boot", si: 0 },
        { k: "shop_open", st: "first_reward", si: 3 },
        { k: "funnel_stage", st: "boot", si: 0 },
      ],
    });
    expect(funnel(ctx).steps.map((s) => s.stage)).toEqual(["boot"]);
    expect(funnel(ctx).steps[0]!.reached).toBe(1);
  });

  it("refuses stage ids that are not lowercase words", () => {
    const ctx = buildCtx();
    for (const bad of ["Boot", "first-flight", "", "<script>", "b".repeat(40), "1st", "boot ", " boot"]) {
      post(ctx, { deviceId: "d", events: [{ k: "funnel_stage", st: bad, si: 1 }] });
    }
    expect(funnel(ctx).steps).toEqual([]);
  });

  it("clamps an absurd stage index instead of trusting it", () => {
    const ctx = buildCtx();
    post(ctx, { deviceId: "d", events: [{ k: "funnel_stage", st: "boot", si: 9_999 }, { k: "funnel_stage", st: "second_run", si: 7 }] });
    const steps = funnel(ctx).steps;
    expect(steps.map((s) => s.stage)).toEqual(["second_run", "boot"]);
    expect(steps[1]!.step).toBe(31);
  });

  it("stops accepting new stages past the row cap, and keeps counting the ones it has", () => {
    const ctx = buildCtx();
    for (let i = 0; i < 60; i += 1) {
      post(ctx, { deviceId: `d${i}`, events: [{ k: "funnel_stage", st: `stage_${i}`, si: i % 32 }] });
    }
    const report = funnel(ctx);
    expect(report.steps.length).toBeLessThanOrEqual(48);
    // A known stage still folds after the cap is reached.
    post(ctx, { deviceId: "d", events: [{ k: "funnel_stage", st: "stage_0", si: 0 }] });
    const after = funnel(ctx).steps.find((s) => s.stage === "stage_0");
    expect(after?.reached).toBe(2);
  });

  it("counts a stall against the stage the session stopped at", () => {
    const ctx = buildCtx();
    session(ctx, "a", 3);
    session(ctx, "b", 3);
    const report = funnel(ctx);
    const row = report.steps.find((s) => s.stage === "first_flight")!;
    expect(row.stalled).toBe(2);
    expect(row.reached).toBe(2);
  });
});
