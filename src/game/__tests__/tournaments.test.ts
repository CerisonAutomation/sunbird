import { describe, expect, it } from "vitest";
import { Tournaments, emptyTournamentState, tierFor, tournamentsForWeek, weekKey } from "../Tournaments";

describe("tournament week key", () => {
  it("anchors to Monday and zero-pads the week", () => {
    // 2026-09-10 is a Thursday → week 37 of 2026. weekKey anchors on the
    // player-local day (same convention as dateSeed), so build dates from
    // local parts instead of UTC-string literals that shift on other zones.
    expect(weekKey(new Date(2026, 8, 10, 12))).toBe("2026-W37");
  });

  it("is stable across the whole week", () => {
    const mon = weekKey(new Date(2026, 8, 7));
    const sun = weekKey(new Date(2026, 8, 13, 23, 59, 59));
    expect(mon).toBe(sun);
  });
});

describe("tournament rotation", () => {
  it("returns a non-empty list for any week", () => {
    const week = tournamentsForWeek(new Date(2026, 8, 7));
    expect(week.length).toBeGreaterThan(0);
  });

  it("is deterministic per week and differs across weeks", () => {
    const w1 = tournamentsForWeek(new Date(2026, 8, 7));
    const w1b = tournamentsForWeek(new Date(2026, 8, 7, 12));
    expect(w1.map((c) => c.id)).toEqual(w1b.map((c) => c.id));
    const w2 = tournamentsForWeek(new Date(2026, 8, 14));
    expect(w2[0]!.id).not.toBe(w1[0]!.id);
  });

  it("each tournament has valid cut thresholds", () => {
    const week = tournamentsForWeek(new Date(2026, 8, 7));
    for (const t of week) {
      expect(t.cuts.bronze).toBeGreaterThan(0);
      expect(t.cuts.silver).toBeGreaterThan(t.cuts.bronze);
      expect(t.cuts.gold).toBeGreaterThan(t.cuts.silver);
    }
  });
});

describe("tierFor", () => {
  const def = tournamentsForWeek(new Date(2026, 8, 7))[0]!;
  it("maps a value onto the highest tier reached", () => {
    expect(tierFor(def, 0)).toBeNull();
    expect(tierFor(def, def.cuts.bronze)).toBe("bronze");
    expect(tierFor(def, def.cuts.silver)).toBe("silver");
    expect(tierFor(def, def.cuts.gold)).toBe("gold");
  });
});

describe("Tournaments class", () => {
  it("emptyTournamentState returns a valid initial state", () => {
    const s = emptyTournamentState();
    expect(s).toBeDefined();
  });

  it("can record an entry", () => {
    const t = new Tournaments(emptyTournamentState());
    const week = tournamentsForWeek();
    const def = week[0]!;
    t.recordEntry(def.id, 500);
    const entry = t.getEntry(def.id);
    expect(entry).not.toBeNull();
    expect(entry!.best).toBe(500);
  });
});
