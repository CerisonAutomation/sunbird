import { describe, expect, it } from "vitest";
import { BOOSTS, SHOP_TRAILS, SKINS, dailyDealBoost, skinById } from "../Economy";
import { SEASON_TIER_DEFS } from "../SeasonPass";
import { TRAILS } from "../Tournaments";
import { MODES } from "../Modes";
import { BIOMES, biomeForIsland } from "../Biomes";

describe("skin catalogue", () => {
  it("has a meaningful roster (60+) with unique ids", () => {
    expect(SKINS.length).toBeGreaterThanOrEqual(60);
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

describe("shop trails", () => {
  it("every shop trail has matching in-flight colors in TRAILS", () => {
    for (const t of SHOP_TRAILS) {
      expect(TRAILS[t.id]).toBeDefined();
      expect(TRAILS[t.id]!.colors.length).toBe(t.css.length);
      expect(t.price).toBeGreaterThan(0);
    }
  });

  it("shop trail ids never collide with prize trail ids or each other", () => {
    const ids = SHOP_TRAILS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    // prize trails granted by cups must stay earn-only
    for (const prize of ["trail_comet", "trail_prism", "trail_star", "trail_duelist", "trail_gauntlet"]) {
      expect(ids).not.toContain(prize);
    }
  });
});

describe("daily deal", () => {
  it("is deterministic for a given date and always cheaper", () => {
    const a = dailyDealBoost("2026-09-11");
    const b = dailyDealBoost("2026-09-11");
    expect(a).toEqual(b);
    const def = BOOSTS.find((x) => x.id === a.id)!;
    expect(a.price).toBeLessThan(def.price);
    expect(a.price).toBeGreaterThanOrEqual(10);
  });

  it("rotates across dates", () => {
    const seen = new Set<string>();
    for (let d = 1; d <= 20; d++) seen.add(dailyDealBoost(`2026-10-${String(d).padStart(2, "0")}`).id);
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("worlds", () => {
  it("has 9 hand-tuned biomes with unique ids", () => {
    expect(BIOMES.length).toBe(9);
    expect(new Set(BIOMES.map((b) => b.id)).size).toBe(BIOMES.length);
  });

  it("wild islands beyond the roster are deterministic remixes", () => {
    const i = BIOMES.length + 3;
    const a = biomeForIsland(i);
    const b = biomeForIsland(i);
    expect(a.id).toBe(b.id);
    expect(a.name).toContain(" ");
    expect(a.amp).toBeGreaterThan(0);
  });

  it("every biome keeps play-critical fields in sane ranges", () => {
    for (const b of BIOMES) {
      expect(b.amp).toBeGreaterThan(0.5);
      expect(b.amp).toBeLessThan(2);
      expect(b.thermals).toBeGreaterThanOrEqual(1);
      expect(b.thermals).toBeLessThanOrEqual(8);
      expect(["none", "gust", "storm"]).toContain(b.hazard);
    }
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
