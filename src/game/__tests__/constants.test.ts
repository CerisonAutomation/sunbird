import { describe, it, expect } from "vitest";
import * as c from "../constants";

describe("Game Constants", () => {
  describe("Physics Constants", () => {
    it("PHYS_HZ is positive", () => {
      expect(c.PHYS_HZ).toBeGreaterThan(0);
    });

    it("PHYS_DT is reciprocal of PHYS_HZ", () => {
      expect(c.PHYS_DT).toBeCloseTo(1 / c.PHYS_HZ, 10);
    });

    it("GRAVITY_GLIDE is positive and less than GRAVITY_DIVE", () => {
      expect(c.GRAVITY_GLIDE).toBeGreaterThan(0);
      expect(c.GRAVITY_DIVE).toBeGreaterThan(c.GRAVITY_GLIDE);
    });

    it("MAX_SPEED is positive", () => {
      expect(c.MAX_SPEED).toBeGreaterThan(0);
    });

    it("MAX_SPEED_FEVER is greater than MAX_SPEED", () => {
      expect(c.MAX_SPEED_FEVER).toBeGreaterThan(c.MAX_SPEED);
    });

    it("BIRD_RADIUS is positive", () => {
      expect(c.BIRD_RADIUS).toBeGreaterThan(0);
    });

    it("MIN_KEEP_SPEED is positive", () => {
      expect(c.MIN_KEEP_SPEED).toBeGreaterThan(0);
    });
  });

  describe("Landing Constants", () => {
    it("LAND_PERFECT is between 0 and 1", () => {
      expect(c.LAND_PERFECT).toBeGreaterThan(0);
      expect(c.LAND_PERFECT).toBeLessThanOrEqual(1);
    });

    it("LAND_GOOD is less than LAND_PERFECT", () => {
      expect(c.LAND_GOOD).toBeLessThan(c.LAND_PERFECT);
    });

    it("LAND_PERFECT_GAIN is greater than 1", () => {
      expect(c.LAND_PERFECT_GAIN).toBeGreaterThan(1);
    });

    it("LAND_GOOD_KEEP is between 0 and 1", () => {
      expect(c.LAND_GOOD_KEEP).toBeGreaterThan(0);
      expect(c.LAND_GOOD_KEEP).toBeLessThanOrEqual(1);
    });
  });

  describe("Island Constants", () => {
    it("ISLAND_PERIOD is positive", () => {
      expect(c.ISLAND_PERIOD).toBeGreaterThan(0);
    });

    it("RAMP_START is less than GAP_START", () => {
      expect(c.RAMP_START).toBeLessThan(c.GAP_START);
    });

    it("GAP_START is less than ISLAND_PERIOD", () => {
      expect(c.GAP_START).toBeLessThan(c.ISLAND_PERIOD);
    });

    it("OCEAN_FLOOR is negative", () => {
      expect(c.OCEAN_FLOOR).toBeLessThan(0);
    });

    it("WATER_Y is positive", () => {
      expect(c.WATER_Y).toBeGreaterThan(0);
    });
  });

  describe("Terrain Constants", () => {
    it("CHUNK_SIZE is positive", () => {
      expect(c.CHUNK_SIZE).toBeGreaterThan(0);
    });

    it("CHUNK_RES is positive", () => {
      expect(c.CHUNK_RES).toBeGreaterThan(0);
    });

    it("TERRAIN_HALF_Z is positive", () => {
      expect(c.TERRAIN_HALF_Z).toBeGreaterThan(0);
    });

    it("VISIBLE_CHUNKS_FWD is greater than VISIBLE_CHUNKS_BACK", () => {
      expect(c.VISIBLE_CHUNKS_FWD).toBeGreaterThan(c.VISIBLE_CHUNKS_BACK);
    });
  });

  describe("Gameplay Constants", () => {
    it("DAYLIGHT_MAX is positive", () => {
      expect(c.DAYLIGHT_MAX).toBeGreaterThan(0);
    });

    it("FEVER_NEED is positive", () => {
      expect(c.FEVER_NEED).toBeGreaterThan(0);
    });

    it("FEVER_DURATION is positive", () => {
      expect(c.FEVER_DURATION).toBeGreaterThan(0);
    });

    it("COIN_VALUE is positive", () => {
      expect(c.COIN_VALUE).toBeGreaterThan(0);
    });

    it("MAGNET_RADIUS is positive", () => {
      expect(c.MAGNET_RADIUS).toBeGreaterThan(0);
    });
  });

  describe("Power-up Constants", () => {
    it("PU_LONGGLIDE is positive", () => {
      expect(c.PU_LONGGLIDE).toBeGreaterThan(0);
    });

    it("PU_WINGBOOST is positive", () => {
      expect(c.PU_WINGBOOST).toBeGreaterThan(0);
    });

    it("PU_SPEED is greater than 1", () => {
      expect(c.PU_SPEED).toBeGreaterThan(1);
    });

    it("PU_FEATHER is positive", () => {
      expect(c.PU_FEATHER).toBeGreaterThan(0);
    });

    it("BOOST_EXTRA_SPEED is positive", () => {
      expect(c.BOOST_EXTRA_SPEED).toBeGreaterThan(0);
    });
  });

  describe("Economy Constants", () => {
    it("CONTINUE_COST is positive", () => {
      expect(c.CONTINUE_COST).toBeGreaterThan(0);
    });

    it("CONTINUE_DAYLIGHT is positive", () => {
      expect(c.CONTINUE_DAYLIGHT).toBeGreaterThan(0);
    });

    it("SEASON_TIERS is positive", () => {
      expect(c.SEASON_TIERS).toBeGreaterThan(0);
    });

    it("SEASON_XP_PER_TIER is positive", () => {
      expect(c.SEASON_XP_PER_TIER).toBeGreaterThan(0);
    });

    it("VIP_DAILY_GIFT is positive", () => {
      expect(c.VIP_DAILY_GIFT).toBeGreaterThan(0);
    });
  });

  describe("Season ID Generation", () => {
    it("returns YYYY-MM format", () => {
      const id = c.seasonId();
      expect(id).toMatch(/^\d{4}-\d{2}$/);
    });

    it("returns consistent value for same month", () => {
      const date = new Date(2026, 0, 15); // Jan 15, 2026
      const id = c.seasonId(date);
      expect(id).toBe("2026-01");
    });

    it("handles month boundaries", () => {
      const dec = new Date(2025, 11, 31); // Dec 31, 2025
      const jan = new Date(2026, 0, 1); // Jan 1, 2026
      expect(c.seasonId(dec)).toBe("2025-12");
      expect(c.seasonId(jan)).toBe("2026-01");
    });
  });

  describe("Save Key Constants", () => {
    it("SAVE_KEY is defined", () => {
      expect(typeof c.SAVE_KEY).toBe("string");
      expect(c.SAVE_KEY.length).toBeGreaterThan(0);
    });

    it("SAVE_KEY_V1 is defined", () => {
      expect(typeof c.SAVE_KEY_V1).toBe("string");
      expect(c.SAVE_KEY_V1.length).toBeGreaterThan(0);
    });
  });

  describe("Ad Constants", () => {
    it("ADS_PER_DAY is positive", () => {
      expect(c.ADS_PER_DAY).toBeGreaterThan(0);
    });

    it("AD_MIN_RUN_GAP is positive", () => {
      expect(c.AD_MIN_RUN_GAP).toBeGreaterThan(0);
    });

    it("AD_DURATION is positive", () => {
      expect(c.AD_DURATION).toBeGreaterThan(0);
    });

    it("REWARDED_COIN_MULTIPLIER is greater than 1", () => {
      expect(c.REWARDED_COIN_MULTIPLIER).toBeGreaterThan(1);
    });
  });
});
