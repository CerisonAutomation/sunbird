import { describe, expect, it } from "vitest";
import { BOOSTS, SKINS, skinById } from "../Economy";
import { SEASON_TIER_DEFS } from "../SeasonPass";
import { TRAILS } from "../Tournaments";
import { MODES } from "../Modes";

describe("skin catalogue", () => {
  it("has a meaningful roster (20+) with unique ids", () => {
    expect(SKINS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(SKINS.map((s) => s.id)).size).toBe(SKINS.length);
  });

  it("every purchasable skin has a sane price and perks in range", () => {
    for (const s of SKINS) {
      expect(s.price).toBeGreaterThanOrEqual(0);
      expect(s.speedMult).toBeGreaterThanOrEqual(1);
      expect(s.speedMult).toBeLessThanOrEqual(1.08); // no pay-to-win runaway
      expect(s.feverBonus).toBeLessThanOrEqual(5);
      expect(s.daylightBonus).toBeLessThanOrEqual(10);
    }
  });

  it("prize skins are never purchasable and explain how to earn them", () => {
    for (const s of SKINS.filter((x) => x.prizeOnly)) {
      expect(s.price).toBe(0);
      expect(s.prizeOnly!.length).toBeGreaterThan(4);
    }
  });

  it("skinById falls back to the starter", () => {
    expect(skinById("nope").id).toBe("sunbird");
  });
});

describe("season pass", () => {
  it("has 50 tiers with strictly increasing xp", () => {
    expect(SEASON_TIER_DEFS).toHaveLength(50);
    for (let i = 1; i < SEASON_TIER_DEFS.length; i++) {
      expect(SEASON_TIER_DEFS[i]!.xpNeeded).toBeGreaterThan(SEASON_TIER_DEFS[i - 1]!.xpNeeded);
    }
  });

  it("every reward references a real unlock", () => {
    const skinIds = new Set(SKINS.map((s) => s.id));
    const boostIds = new Set(BOOSTS.map((b) => b.id));
    for (const t of SEASON_TIER_DEFS) {
      for (const r of [t.free, t.premium]) {
        if (r.kind === "skin") expect(skinIds.has(r.id)).toBe(true);
        else if (r.kind === "boost") expect(boostIds.has(r.id)).toBe(true);
        else if (r.kind === "trail") expect(TRAILS[r.id]).toBeDefined();
        else expect(r.amount).toBeGreaterThan(0);
      }
    }
  });

  it("free track includes real exclusives, not only coins", () => {
    const freeKinds = new Set(SEASON_TIER_DEFS.map((t) => t.free.kind));
    expect(freeKinds.has("trail")).toBe(true);
    expect(freeKinds.has("skin")).toBe(true);
  });
});

describe("modes", () => {
  it("mode ids are unique and finish/clock are consistent", () => {
    expect(new Set(MODES.map((m) => m.id)).size).toBe(MODES.length);
    for (const m of MODES) {
      expect(m.clock).toBeGreaterThanOrEqual(0);
      expect(m.finish).toBeGreaterThanOrEqual(0);
    }
  });
});
