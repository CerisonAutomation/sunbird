import { describe, it, expect, beforeEach } from "vitest";
import { SaveData } from "../SaveData";

describe("SaveData", () => {
  let saveData: SaveData;

  beforeEach(() => {
    localStorage.clear();
    saveData = new SaveData();
  });

  describe("Constructor", () => {
    it("creates default state when no saved data exists", () => {
      expect(saveData.state).toBeDefined();
      expect(saveData.state.bestScore).toBe(0);
      expect(saveData.state.bestDistance).toBe(0);
      expect(saveData.state.totalCoins).toBe(0);
      expect(saveData.state.wallet).toBe(0);
      expect(saveData.state.runsPlayed).toBe(0);
    });

    it("generates a device ID", () => {
      expect(saveData.state.deviceId).toBeDefined();
      expect(saveData.state.deviceId.length).toBeGreaterThan(0);
    });

    it("generates a referral code from device ID", () => {
      expect(saveData.state.referralCode).toMatch(/^SUN-[A-Z0-9]{6}$/);
    });
  });

  describe("recordRun", () => {
    it("updates distance and coins", () => {
      saveData.recordRun(100, 25, 500, "2026-01-01", 2, "green_hills");
      expect(saveData.state.bestDistance).toBe(100);
      expect(saveData.state.totalCoins).toBe(25);
      expect(saveData.state.wallet).toBe(25);
      expect(saveData.state.runsPlayed).toBe(1);
    });

    it("updates high scores", () => {
      saveData.recordRun(100, 25, 500, "2026-01-01", 2, "green_hills");
      saveData.recordRun(200, 50, 1000, "2026-01-02", 3, "sunset_ridge");
      expect(saveData.state.highScores.length).toBe(2);
      expect(saveData.state.highScores[0].score).toBe(1000);
    });

    it("limits high scores to 8", () => {
      for (let i = 0; i < 10; i++) {
        saveData.recordRun(100 + i, 10, 100 + i * 100, `2026-01-${i + 1}`, 1, "green_hills");
      }
      expect(saveData.state.highScores.length).toBe(8);
    });

    it("tracks biome visits via trackBiomeVisit", () => {
      saveData.trackBiomeVisit("green_hills");
      saveData.trackBiomeVisit("green_hills");
      saveData.trackBiomeVisit("sunset_ridge");
      expect(saveData.state.lifetime.biomeVisits["green_hills"]).toBe(2);
      expect(saveData.state.lifetime.biomeVisits["sunset_ridge"]).toBe(1);
    });
  });

  describe("addCoins", () => {
    it("adds coins to wallet and total", () => {
      saveData.addCoins(100);
      expect(saveData.state.wallet).toBe(100);
      expect(saveData.state.totalCoins).toBe(100);
    });

    it("accumulates coins", () => {
      saveData.addCoins(50);
      saveData.addCoins(75);
      expect(saveData.state.wallet).toBe(125);
      expect(saveData.state.totalCoins).toBe(125);
    });
  });

  describe("spend", () => {
    it("returns true and deducts coins when sufficient", () => {
      saveData.addCoins(100);
      const result = saveData.spend(50);
      expect(result).toBe(true);
      expect(saveData.state.wallet).toBe(50);
    });

    it("returns false and does not deduct when insufficient", () => {
      saveData.addCoins(50);
      const result = saveData.spend(100);
      expect(result).toBe(false);
      expect(saveData.state.wallet).toBe(50);
    });
  });

  describe("VIP System", () => {
    it("grantVip sets vip to true", () => {
      saveData.grantVip(30);
      expect(saveData.state.vip).toBe(true);
      expect(saveData.state.vipUntil).toBeGreaterThan(Date.now());
    });

    it("isVipActive checks expiration", () => {
      saveData.grantVip(30);
      expect(saveData.isVipActive()).toBe(true);
    });

    it("vipDaysLeft returns correct count", () => {
      saveData.grantVip(30);
      const daysLeft = saveData.vipDaysLeft();
      expect(daysLeft).toBeGreaterThanOrEqual(29);
      expect(daysLeft).toBeLessThanOrEqual(31);
    });

    it("claimVipDaily gives coins", () => {
      saveData.grantVip(30);
      const coins = saveData.claimVipDaily("2026-01-01");
      expect(coins).toBeGreaterThan(0);
    });

    it("claimVipDaily prevents double claim", () => {
      saveData.grantVip(30);
      saveData.claimVipDaily("2026-01-01");
      const coins = saveData.claimVipDaily("2026-01-01");
      expect(coins).toBe(0);
    });
  });

  describe("Ad System", () => {
    it("adsLeftToday returns cap when no ads shown", () => {
      const left = saveData.adsLeftToday(6);
      expect(left).toBe(6);
    });

    it("recordAdImpression increments count", () => {
      saveData.recordAdImpression(1);
      const left = saveData.adsLeftToday(6);
      expect(left).toBe(5);
    });

    it("shouldShowInterstitial respects min runs", () => {
      expect(saveData.shouldShowInterstitial(1)).toBe(false);
      expect(saveData.shouldShowInterstitial(2)).toBe(true);
    });
  });

  describe("Missions", () => {
    it("completeMission returns true on first completion", () => {
      const result = saveData.completeMission("test-mission");
      expect(result).toBe(true);
      expect(saveData.state.completedMissions).toContain("test-mission");
    });

    it("completeMission returns false on duplicate", () => {
      saveData.completeMission("test-mission");
      const result = saveData.completeMission("test-mission");
      expect(result).toBe(false);
    });

    it("nestMultiplier increases with completed missions", () => {
      const base = saveData.nestMultiplier();
      saveData.completeMission("m1");
      saveData.completeMission("m2");
      const after = saveData.nestMultiplier();
      expect(after).toBeGreaterThan(base);
    });
  });

  describe("Skins", () => {
    it("starts with sunbird skin", () => {
      expect(saveData.state.ownedSkins).toContain("sunbird");
    });

    it("ownSkin adds to collection", () => {
      saveData.ownSkin("golden");
      expect(saveData.state.ownedSkins).toContain("golden");
    });

    it("equipSkin changes active skin", () => {
      saveData.ownSkin("golden");
      saveData.equipSkin("golden");
      expect(saveData.state.activeSkin).toBe("golden");
    });

    it("equipSkin fails for unowned skin", () => {
      saveData.equipSkin("golden");
      expect(saveData.state.activeSkin).toBe("sunbird");
    });
  });

  describe("Streak System", () => {
    it("touchStreak starts at day 1", () => {
      const reward = saveData.touchStreak("2026-01-01", "");
      expect(reward).toBeGreaterThan(0);
      expect(saveData.state.streak.days).toBe(1);
    });

    it("touchStreak increments on consecutive days", () => {
      saveData.touchStreak("2026-01-01", "");
      saveData.touchStreak("2026-01-02", "2026-01-01");
      expect(saveData.state.streak.days).toBe(2);
    });

    it("touchStreak resets on gap", () => {
      saveData.touchStreak("2026-01-01", "");
      saveData.touchStreak("2026-01-05", "2026-01-04");
      expect(saveData.state.streak.days).toBe(1);
    });

    it("touchStreak prevents double claim", () => {
      saveData.touchStreak("2026-01-01", "");
      const reward = saveData.touchStreak("2026-01-01", "");
      expect(reward).toBe(0);
    });
  });

  describe("Export/Import", () => {
    it("exportCode returns base64 string", () => {
      const code = saveData.exportCode();
      expect(typeof code).toBe("string");
      expect(code.length).toBeGreaterThan(0);
    });

    it("importCode restores save data", () => {
      saveData.addCoins(100);
      const code = saveData.exportCode();
      
      localStorage.clear();
      const newSave = new SaveData();
      const result = newSave.importCode(code);
      
      expect(result).toBe(true);
      expect(newSave.state.wallet).toBe(100);
    });

    it("importCode rejects invalid code", () => {
      const result = saveData.importCode("invalid");
      expect(result).toBe(false);
    });
  });

  describe("Persistence", () => {
    it("persists and loads correctly", () => {
      saveData.addCoins(100);
      saveData.persist();
      
      // Create new instance to test loading
      const newSave = new SaveData();
      expect(newSave.state.wallet).toBe(100);
    });

    it("loads default when no data exists", () => {
      localStorage.clear();
      const newSave = new SaveData();
      expect(newSave.state.wallet).toBe(0);
    });
  });

  describe("Reset", () => {
    it("resetProgress clears all data", () => {
      saveData.addCoins(100);
      saveData.completeMission("test");
      saveData.resetProgress();
      
      expect(saveData.state.wallet).toBe(0);
      expect(saveData.state.completedMissions).toHaveLength(0);
      expect(saveData.state.runsPlayed).toBe(0);
    });
  });
});
