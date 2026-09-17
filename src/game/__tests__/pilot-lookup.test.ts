import { describe, expect, it, vi } from "vitest";
import { PilotBook, isRealPilotName, searchPilots, seenAgo, type FlightMate } from "../pilots";
import { SquadClient } from "../Squad";

function memoryStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void; data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

const peer = (id: string, name: string, extra: { distance?: number; place?: number; skin?: string } = {}) => ({
  id,
  name,
  skin: "sunbird",
  distance: 0,
  place: 0,
  ...extra,
});

describe("PilotBook — the real pilots you flew with", () => {
  it("remembers real room rosters and ignores the server's placeholders", () => {
    const book = new PilotBook(memoryStorage());
    book.remember([peer("a", "Bora Sky", { distance: 1450 }), peer("b", "Pilot"), peer("c", ""), peer("d", "AI")], "FLOCK", 1_000);

    expect(book.all().map((m) => m.name)).toEqual(["Bora Sky"]);
    expect(book.all()[0]!.roomCode).toBe("FLOCK");
  });

  it("keeps the best distance and the freshest room for a repeat pilot", () => {
    const book = new PilotBook(memoryStorage());
    book.remember([peer("a", "Bora Sky", { distance: 900 })], "ALPHA", 1_000);
    book.remember([peer("a", "Bora Sky", { distance: 1450 })], "BETA", 5_000);

    const mate = book.all()[0]!;
    expect(book.all()).toHaveLength(1);
    expect(mate.bestDistance).toBe(1450);
    expect(mate.roomCode).toBe("BETA");
    expect(mate.lastSeenAt).toBe(5000);
  });

  it("never records anyone without a shared room code", () => {
    const book = new PilotBook(memoryStorage());
    expect(book.remember([peer("a", "Bora Sky")], "", 1_000)).toBe(false);
    expect(book.all()).toEqual([]);
  });

  it("persists to storage and survives the next session", () => {
    const storage = memoryStorage();
    new PilotBook(storage).remember([peer("a", "Bora Sky", { distance: 1200 })], "FLOCK", 1_000);

    const reloaded = new PilotBook(storage);
    expect(reloaded.all().map((m) => m.name)).toEqual(["Bora Sky"]);
    expect(reloaded.all()[0]!.bestDistance).toBe(1200);
  });

  it("caps the book, forgets on request and searches by real name", () => {
    const book = new PilotBook(memoryStorage());
    for (let i = 0; i < 60; i++) book.remember([peer(`p${i}`, `Pilot ${i}`)], "FLOCK", 1_000 + i);
    expect(book.all().length).toBe(40);

    expect(book.search("pilot 5").length).toBeGreaterThan(0);
    expect(book.search("nobody")).toEqual([]);

    const name = book.all()[0]!.name;
    expect(book.forget(name)).toBe(true);
    expect(book.search(name)).toEqual([]);
  });

  it("labels names that are placeholders, never pilots", () => {
    expect(isRealPilotName("Bora Sky")).toBe(true);
    expect(isRealPilotName("Pilot")).toBe(false);
    expect(isRealPilotName("AI")).toBe(false);
    expect(isRealPilotName("")).toBe(false);
    expect(isRealPilotName("x".repeat(30))).toBe(false);
  });

  it("formats how long ago a pilot was seen", () => {
    const now = 1_000_000;
    expect(seenAgo(now - 5_000, now)).toBe("just now");
    expect(seenAgo(now - 10 * 60_000, now)).toBe("10m ago");
    expect(seenAgo(now - 3 * 3_600_000, now)).toBe("3h ago");
    expect(seenAgo(now - 48 * 3_600_000, now)).toBe("2d ago");
  });

  it("searches entries case-insensitively as a free function too", () => {
    const entries: FlightMate[] = [
      { id: "a", name: "Bora Sky", skin: "sunbird", roomCode: "AA", lastSeenAt: 2, bestDistance: 0, placed: 0 },
      { id: "b", name: "Sunbird Nine", skin: "sunbird", roomCode: "AA", lastSeenAt: 1, bestDistance: 0, placed: 0 },
    ];
    expect(searchPilots(entries, "bOrA").map((m) => m.name)).toEqual(["Bora Sky"]);
    expect(searchPilots(entries, "")).toHaveLength(2);
  });
});

describe("Pilot lookup honesty", () => {
  it("refuses to invent a pilot when the build is offline", async () => {
    const squad = new SquadClient("lookup-offline", () => "Captain Falcon");
    squad.enableAutonomous();

    const result = await squad.lookupPilot("SUN-9F3K2A");
    expect(result.status).toBe("unavailable");
    expect(result.name).toBe("");
    expect(result.code).toBe("");
    expect(result.message).toMatch(/online service/i);
  });

  it("tells the player when a code is malformed instead of guessing", async () => {
    const squad = new SquadClient("lookup-bad", () => "Captain Falcon");
    squad.enableAutonomous();

    const result = await squad.lookupPilot("nope");
    expect(result.status).toBe("unknown");
    expect(result.name).toBe("");
    expect(result.message).toMatch(/SUN-9F3K2A/);
  });

  it("asks the directory for a real code and only reports what came back", async () => {
    const squad = new SquadClient("lookup-online", () => "Captain Falcon");
    // Simulate a service that knows the code: the only fields the panel may
    // show are the ones the directory actually returned.
    const call = vi
      .spyOn(squad as unknown as { call: (...a: unknown[]) => Promise<unknown> }, "call")
      .mockResolvedValue({
        pilot: {
          name: "Bora Sky",
          code: "SUN-9F3K2A",
          online: true,
          club: { name: "Thermal Drifters" },
          bestDistance: 12345,
          rank: 7,
          friend: false,
          outgoing: false,
          incoming: false,
          self: false,
        },
      });

    expect(squad.hasService()).toBe(true);
    const result = await squad.lookupPilot("sun-9f3k2a");

    expect(call).toHaveBeenCalledWith(expect.stringContaining("/players/SUN-9F3K2A"));
    expect(result.status).toBe("ok");
    expect(result.name).toBe("Bora Sky");
    expect(result.online).toBe(true);
    expect(result.club).toBe("Thermal Drifters");
    expect(result.bestDistance).toBe(12345);
    expect(result.rank).toBe(7);
    call.mockRestore();
  });

  it("reports an unknown code as unknown — it never fabricates a name", async () => {
    const squad = new SquadClient("lookup-404", () => "Captain Falcon");
    vi.spyOn(squad as unknown as { call: (...a: unknown[]) => Promise<unknown> }, "call").mockRejectedValue(
      Object.assign(new Error("no pilot"), { status: 404 }),
    );

    const result = await squad.lookupPilot("SUN-AAAAAA");
    expect(result.status).toBe("unknown");
    expect(result.name).toBe("");
    expect(result.message).toContain("SUN-AAAAAA");
  });

  it("saves a pilot met in a race without pretending a code was verified", () => {
    const squad = new SquadClient("wingman-local", () => "Captain Falcon");
    squad.enableAutonomous();

    expect(squad.rememberWingman("Bora Sky")).toContain("Bora Sky");
    const wingman = squad.state.friends[0]!;
    expect(wingman.name).toBe("Bora Sky");
    expect(wingman.local).toBe(true);
    expect(wingman.code).toBe("");
    // Adding the same pilot twice is a no-op, not a duplicate row.
    expect(squad.rememberWingman("bora sky")).toMatch(/already/i);
    expect(squad.state.friends).toHaveLength(1);
  });
});
