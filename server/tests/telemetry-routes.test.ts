import { describe, expect, it } from "vitest";
import { buildCtx } from "../src/server.js";
import { V1_ROUTES } from "../src/http/api.js";
import type { Ctx } from "../src/core/ctx.js";
import type { Route } from "../src/http/router.js";

/**
 * Aggregate client telemetry sink (privacy by construction): whitelisted
 * counter names + coarse numbers only, validated and capped at every layer.
 * These tests pin the contract the client beacon depends on.
 */

function route(method: string, path: string): Route {
  const r = V1_ROUTES.find((rt) => rt.method === method && rt.re.test(path));
  if (!r) throw new Error(`no route for ${method} ${path}`);
  return r;
}

function post(ctx: Ctx, path: string, body: Record<string, unknown>): { accepted: number; keys: number } {
  const r = route("POST", path);
  return r.handler(ctx, {}, new URLSearchParams(), body, "") as { accepted: number; keys: number };
}

function summary(ctx: Ctx): ReturnType<Route["handler"]> {
  const r = route("GET", "/mp/v1/telemetry/summary");
  return r.handler(ctx, {}, new URLSearchParams(), {}, "");
}

const BEACON = {
  deviceId: "device-1",
  events: [{ k: "run_end", mode: "zenith", km: 2.5 }],
};

describe("telemetry sink", () => {
  it("accepts a well-formed beacon and exposes the aggregate", () => {
    const ctx = buildCtx();
    expect(post(ctx, "/mp/v1/telemetry", BEACON)).toMatchObject({ accepted: 1 });
    // Alias paths share the same handler.
    expect(post(ctx, "/telemetry", BEACON).accepted).toBe(1);
    expect(post(ctx, "/social/telemetry", BEACON).accepted).toBe(1);
    const snap = summary(ctx) as ReturnType<import("../src/telemetry/TelemetryService.js").TelemetryService["snapshot"]>;
    expect(snap.totalEvents).toBe(3);
    expect(snap.devices).toBe(1);
    expect(snap.keys[0]).toMatchObject({ key: "run_end#zenith", count: 3, km: 7.5 });
  });

  it("rejects malformed posts without throwing", () => {
    const ctx = buildCtx();
    for (const bad of [null, {}, { deviceId: "d" }, { deviceId: "d", events: "nope" }, { deviceId: 42, events: [] }]) {
      expect(post(ctx, "/mp/v1/telemetry", bad as Record<string, unknown>).accepted).toBe(0);
    }
    const snap = summary(ctx) as ReturnType<import("../src/telemetry/TelemetryService.js").TelemetryService["snapshot"]>;
    expect(snap.rejectedPosts).toBe(5);
  });

  it("drops events with malformed names, accepts clean ones from the same post", () => {
    const ctx = buildCtx();
    const r = post(ctx, "/mp/v1/telemetry", {
      deviceId: "d",
      events: [{ k: "good_name.1" }, { k: "BAD UPPER" }, { k: "" }, { k: "x".repeat(49) }, { k: "ok" }],
    });
    expect(r.accepted).toBe(2);
  });

  it("caps events per post at 64", () => {
    const ctx = buildCtx();
    const events = Array.from({ length: 100 }, (_, i) => ({ k: `evt_${i}` }));
    expect(post(ctx, "/mp/v1/telemetry", { deviceId: "d", events })).toMatchObject({ accepted: 64 });
  });

  it("caps the counter map (bounded memory under a key flood)", () => {
    const ctx = buildCtx();
    const events = Array.from({ length: 800 }, (_, i) => ({ k: `flood_${i}` }));
    const r = post(ctx, "/mp/v1/telemetry", { deviceId: "d", events });
    expect(r.keys).toBeLessThanOrEqual(513); // 512 cap (+transient set before eviction)
  });

  it("caps the device set", () => {
    const ctx = buildCtx();
    for (let i = 0; i < 10_050; i++) {
      post(ctx, "/mp/v1/telemetry", { deviceId: `dev-${i}`, events: [{ k: "run_end" }] });
    }
    const snap = summary(ctx) as ReturnType<import("../src/telemetry/TelemetryService.js").TelemetryService["snapshot"]>;
    expect(snap.devices).toBe(10_000);
  });

  it("clamps insane km values", () => {
    const ctx = buildCtx();
    post(ctx, "/mp/v1/telemetry", { deviceId: "d", events: [{ k: "run_end", km: 999_999_999 }, { k: "run_end", km: Number.NaN }] });
    const snap = summary(ctx) as ReturnType<import("../src/telemetry/TelemetryService.js").TelemetryService["snapshot"]>;
    expect(snap.keys[0]?.km).toBeLessThanOrEqual(100_000);
  });

  it("does not persist anything (counters die with the process by design)", () => {
    const ctx = buildCtx();
    post(ctx, "/mp/v1/telemetry", BEACON);
    expect(ctx.db.state).not.toHaveProperty("telemetry");
  });
});
