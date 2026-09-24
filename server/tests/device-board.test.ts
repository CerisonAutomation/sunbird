import { describe, expect, it } from "vitest";
import { buildCtx } from "../src/server.js";
import { V1_ROUTES } from "../src/http/api.js";
import type { Ctx } from "../src/core/ctx.js";
import type { Route } from "../src/http/router.js";
import { Db, dataFilePath } from "../src/store/db.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Root device board (`/board` + `/score`) — the LEADERBOARD_API.md contract
 * the shipped client speaks. Device-keyed, best-row-per-device (by distance),
 * server-computed rank/total, persisted with the Db state file.
 */

function route(method: string, path: string): Route {
  const r = V1_ROUTES.find((rt) => rt.method === method && rt.re.test(path));
  if (!r) throw new Error(`no route for ${method} ${path}`);
  return r;
}

/** One best-row-per-device entry, as the /board contract returns it. */
type BoardRow = {
  deviceId: string;
  name: string;
  distance: number;
  altitude: number;
  perfects: number;
  coins: number;
  score: number;
  date: string;
  [key: string]: unknown;
};

function get(ctx: Ctx, query: string): { entries: BoardRow[]; rank: number; total: number } {
  const r = route("GET", "/board");
  return r.handler(ctx, {}, new URLSearchParams(query), {}, "") as never;
}

function post(ctx: Ctx, body: Record<string, unknown>): { ok: boolean } {
  const r = route("POST", "/score");
  return r.handler(ctx, {}, new URLSearchParams(), body, "") as never;
}

const ROW = {
  deviceId: "device-A",
  name: "Test Pilot",
  skin: "sunbird",
  distance: 5000,
  altitude: 120,
  perfects: 8,
  coins: 40,
  score: 6100,
};

describe("device board (root /board + /score)", () => {
  it("stores a run and returns it sorted with rank and total", () => {
    const ctx = buildCtx();
    expect(post(ctx, ROW).ok).toBe(true);
    post(ctx, { ...ROW, deviceId: "device-B", distance: 8000, score: 9800, name: "Other Pilot" });

    const page = get(ctx, "scope=global&metric=distance&device=device-A");
    expect(page.total).toBe(2);
    expect(page.rank).toBe(2);
    expect(page.entries).toHaveLength(2);
    expect(page.entries[0]).toMatchObject({ deviceId: "device-B", distance: 8000 });
    // Sorted best-first.
    for (let i = 1; i < page.entries.length; i++) {
      // The handler's JSON rows are loosely typed (`Record<string, unknown>`),
      // so narrow before the numeric comparison — the board contract is that
      // distance sorts best-first.
      expect(Number(page.entries[i - 1]!.distance)).toBeGreaterThanOrEqual(
        Number(page.entries[i]!.distance),
      );
    }
  });

  it("keeps the BEST row per device (a worse run never regresses the board)", () => {
    const ctx = buildCtx();
    post(ctx, ROW);
    post(ctx, { ...ROW, distance: 3000, score: 3500 });
    const page = get(ctx, "scope=global&metric=distance&device=device-A");
    expect(page.entries.find((e) => e.deviceId === "device-A")!.distance).toBe(5000);
  });

  it("sorts by the requested metric and rejects unknown metrics to distance", () => {
    const ctx = buildCtx();
    post(ctx, { ...ROW, altitude: 900, distance: 100 });
    post(ctx, { ...ROW, deviceId: "device-B", altitude: 200, distance: 8000 });
    const byAlt = get(ctx, "scope=global&metric=altitude&device=device-A");
    expect(byAlt.entries[0]).toMatchObject({ deviceId: "device-A", altitude: 900 });
    const byJunk = get(ctx, "scope=global&metric=NOT_A_METRIC&device=device-B");
    expect(byJunk.entries[0]).toMatchObject({ deviceId: "device-B", distance: 8000 });
  });

  it("daily scope only shows rows set today (server clock)", () => {
    const ctx = buildCtx();
    post(ctx, ROW);
    const daily = get(ctx, "scope=daily&metric=distance&device=device-A");
    expect(daily.total).toBe(1);
    // Row's date is stamped from the server clock.
    expect(daily.entries[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("rejects posts without a deviceId and clamps absurd values", () => {
    const ctx = buildCtx();
    expect(() => post(ctx, { ...ROW, deviceId: "" })).toThrow();
    post(ctx, { ...ROW, deviceId: "device-C", distance: 999_999_999, coins: -50, name: "<script>" });
    const page = get(ctx, "scope=global&metric=distance&device=device-C");
    const row = page.entries[0]!;
    expect(row.distance).toBeLessThanOrEqual(500_000);
    expect(row.coins).toBe(0); // negative clamps to 0
    expect(row.name).not.toContain("<");
  });

  it("persists rows across a Db reload (full data storage)", () => {
    const dir = mkdtempSync(join(tmpdir(), "sunbird-board-"));
    try {
      const file = dataFilePath(join(dir, "vol"));
      // Session 1: own Db instance, route handler writes through it.
      const db1 = new Db(undefined, file);
      const ctx1 = buildCtx();
      ctx1.db = db1;
      post(ctx1, { deviceId: "device-P", name: "Persistent Pilot", skin: "sunbird", distance: 4242, altitude: 100, perfects: 5, coins: 25, score: 5000 });
      db1.flush();
      db1.close();

      // Session 2: a fresh Db over the same file must see the row.
      const db2 = new Db(undefined, file);
      const ctx2 = buildCtx();
      ctx2.db = db2;
      const page = get(ctx2, "scope=global&metric=distance&device=device-P");
      expect(page.total).toBe(1);
      expect(page.entries[0]).toMatchObject({ deviceId: "device-P", distance: 4242 });
      db2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("unranked devices get rank 0 (honest 'unranked')", () => {
    const ctx = buildCtx();
    post(ctx, ROW);
    const page = get(ctx, "scope=global&metric=distance&device=nobody");
    expect(page.rank).toBe(0);
    expect(page.total).toBe(1);
  });
});
