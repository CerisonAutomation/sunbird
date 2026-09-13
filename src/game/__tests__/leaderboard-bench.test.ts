import { beforeEach, describe, expect, it, vi } from "vitest";
import { Leaderboard } from "../Leaderboard";

/**
 * The offline board is seeded with 20 generated "benchmark" pilots so a new
 * device has a ladder with a curve on it. They were always deviceId-prefixed
 * `bench-`, but nothing read that prefix: the UI rendered them exactly like
 * real pilots, so "Aria" and "Kestrel" looked like people who had flown.
 *
 * These tests pin both halves — that they are marked, and that they can never
 * be uploaded to the global board as if they were a real flight.
 */
const submission = (over: Partial<Parameters<Leaderboard["submit"]>[0]> = {}) => ({
  deviceId: "dev-me",
  name: "Me",
  skin: "sunbird",
  distance: 900,
  altitude: 50,
  perfects: 2,
  coins: 10,
  score: 1200,
  seed: "test-seed",
  mode: "daytrip" as const,
  ...over,
});

describe("leaderboard benchmark rows", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("flags every generated row as a benchmark", async () => {
    const board = new Leaderboard("dev-me");
    const page = await board.fetch("global", "distance");
    board.dispose();
    const bench = page.entries.filter((e) => e.bench);
    expect(bench.length, "expected the 20 seeded benchmark rows").toBe(20);
    for (const e of bench) expect(e.id.startsWith("bench-")).toBe(true);
  });

  it("never flags a benchmark row as you", async () => {
    const board = new Leaderboard("bench-0");
    const page = await board.fetch("global", "distance");
    board.dispose();
    // Even if the device id somehow matched a benchmark id, a benchmark is
    // not the player's own flight and must not be presented as one.
    expect(page.entries.filter((e) => e.you && e.bench).length).toBe(0);
  });

  it("a real submitted run is not flagged", async () => {
    const board = new Leaderboard("dev-me");
    board.submit(submission());
    const page = await board.fetch("global", "distance");
    board.dispose();
    const me = page.entries.find((e) => e.id === "dev-me");
    expect(me, "the submitted run should be on the board").toBeDefined();
    expect(me!.bench).toBe(false);
    expect(me!.you).toBe(true);
  });

  it("the benchmark spread is deterministic across devices", async () => {
    const la = new Leaderboard("dev-a");
    const a = await la.fetch("global", "distance");
    la.dispose();
    localStorage.clear();
    const lb = new Leaderboard("dev-b");
    const b = await lb.fetch("global", "distance");
    lb.dispose();
    const benchOf = (p: typeof a) =>
      p.entries.filter((e) => e.bench).map((e) => `${e.id}:${e.distance}`).sort();
    expect(benchOf(a)).toEqual(benchOf(b));
  });

  it("an instance whose id IS a benchmark id uploads nothing", async () => {
    // This is the case that broke: the old filter was only
    // `deviceId === this.deviceId`, so a Leaderboard constructed with id
    // `bench-0` matched the generated row and posted it as a real flight.
    // Verified by mutation — reverting the guard makes THIS test fail.
    const posted: { deviceId: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init?: { body?: string }) => {
        if (String(url).includes("/score")) {
          posted.push(JSON.parse(init?.body ?? "{}") as { deviceId: string });
        }
        throw new Error("offline");
      }),
    );
    const board = new Leaderboard("bench-0");
    window.dispatchEvent(new Event("online"));
    for (let i = 0; i < 6; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    board.dispose();

    expect(posted.filter((p) => p.deviceId.startsWith("bench-"))).toEqual([]);
  });

  it("never uploads a benchmark row to the server", async () => {
    const posted: { deviceId: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init?: { body?: string }) => {
        if (String(url).includes("/score")) {
          posted.push(JSON.parse(init?.body ?? "{}") as { deviceId: string });
        }
        throw new Error("offline");
      }),
    );
    const board = new Leaderboard("dev-me");
    // A deliberately SHORT real run: if uploadBest picked the best row on the
    // device it would reach for a ~4.6 km benchmark instead.
    board.submit(submission({ distance: 120, score: 168 }));
    window.dispatchEvent(new Event("online"));
    for (let i = 0; i < 6; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(posted.length, "the real run should have been pushed").toBeGreaterThan(0);
    board.dispose();
    for (const p of posted) {
      expect(p.deviceId.startsWith("bench-"), `uploaded a benchmark row: ${p.deviceId}`).toBe(false);
      expect(p.deviceId).toBe("dev-me");
    }
  });
});
