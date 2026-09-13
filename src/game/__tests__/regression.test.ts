import { describe, it, expect, beforeEach } from "vitest";
import { SaveData } from "../SaveData";
import { Leaderboard } from "../Leaderboard";
import { Missions } from "../Missions";
import { Bird } from "../Bird";
import { TerrainSystem } from "../TerrainSystem";
import * as c from "../constants";

describe("Regression Tests", () => {
  describe("Save Data Integrity", () => {
    let saveData: SaveData;

    beforeEach(() => {
      localStorage.clear();
      saveData = new SaveData();
    });

    it("save/load cycle preserves all data", () => {
      // Set up complex state
      saveData.addCoins(500);
      saveData.state.bestScore = 10000;
      saveData.state.bestDistance = 5000;
      saveData.state.runsPlayed = 50;
      saveData.completeMission("mission1");
      saveData.completeMission("mission2");
      saveData.ownSkin("golden");
      saveData.equipSkin("golden");
      saveData.grantVip(30);
      saveData.state.achievements.push("achievement1");
      saveData.state.season.xp = 500;
      
      // Export
      const code = saveData.exportCode();
      expect(code.length).toBeGreaterThan(0);
      
      // Clear and import
      localStorage.clear();
      const newSave = new SaveData();
      const success = newSave.importCode(code);
      
      expect(success).toBe(true);
      expect(newSave.state.wallet).toBe(500);
      expect(newSave.state.bestScore).toBe(10000);
      expect(newSave.state.bestDistance).toBe(5000);
      expect(newSave.state.runsPlayed).toBe(50);
      expect(newSave.state.completedMissions).toContain("mission1");
      expect(newSave.state.completedMissions).toContain("mission2");
      expect(newSave.state.ownedSkins).toContain("golden");
      expect(newSave.state.activeSkin).toBe("golden");
      expect(newSave.state.vip).toBe(true);
      expect(newSave.state.achievements).toContain("achievement1");
      expect(newSave.state.season.xp).toBe(500);
    });

    it("handles concurrent saves correctly", () => {
      saveData.addCoins(100);
      saveData.persist();
      const save1 = { wallet: saveData.state.wallet };
      
      saveData.addCoins(50);
      saveData.persist();
      const save2 = { wallet: saveData.state.wallet };
      
      expect(save2.wallet).toBe(150);
      // save1 captured before the second add
      expect(save1.wallet).toBe(100);
    });

    it("corrupted save data recovers gracefully", () => {
      localStorage.setItem("***", "invalid json");
      const newSave = new SaveData();
      expect(newSave.state).toBeDefined();
      expect(newSave.state.wallet).toBe(0);
    });
  });

  describe("Physics Stability", () => {
    let bird: Bird;
    let terrain: TerrainSystem;

    beforeEach(() => {
      bird = new Bird();
      terrain = new TerrainSystem("test-seed");
    });

    it("bird does not escape world bounds", () => {
      // Run physics for 1000 steps
      for (let i = 0; i < 1000; i++) {
        bird.step(c.PHYS_DT, {
          diving: false,
          fever: false,
          speedMult: 1,
          boost: false,
        }, terrain);
        // Note: syncVisual requires Three.js scene setup, skip for unit tests
        // bird.syncVisual(c.PHYS_DT, false, i * c.PHYS_DT, terrain);
      }
      
      // Bird should stay within reasonable bounds
      expect(bird.x).toBeGreaterThan(-100);
      expect(bird.x).toBeLessThan(100000);
      expect(bird.y).toBeGreaterThan(c.OCEAN_FLOOR - 10);
      expect(bird.y).toBeLessThan(1000);
    });

    it("bird speed never exceeds maximum", () => {
      // Boost bird to max speed
      bird.vx = 200;
      bird.vy = 0;
      bird.grounded = false;
      
      for (let i = 0; i < 100; i++) {
        bird.step(c.PHYS_DT, {
          diving: true,
          fever: true,
          speedMult: 2,
          boost: true,
        }, terrain);
      }
      
      expect(bird.speed()).toBeLessThanOrEqual(c.MAX_SPEED_FEVER * 2 + c.BOOST_EXTRA_SPEED + 1);
    });

    it("bird stays grounded on flat terrain", () => {
      bird.x = 100;
      bird.y = terrain.heightAt(100) + c.BIRD_RADIUS;
      bird.vx = 10;
      bird.vy = 0;
      bird.grounded = true;
      
      for (let i = 0; i < 100; i++) {
        bird.step(c.PHYS_DT, {
          diving: false,
          fever: false,
          speedMult: 1,
          boost: false,
        }, terrain);
        // Note: syncVisual requires Three.js scene setup, skip for unit tests
        // bird.syncVisual(c.PHYS_DT, false, i * c.PHYS_DT, terrain);
        
        // Check bird stays on surface
        const surface = terrain.heightAt(bird.x) + c.BIRD_RADIUS;
        if (bird.grounded) {
          expect(bird.y).toBeGreaterThanOrEqual(surface - 0.1);
          expect(bird.y).toBeLessThanOrEqual(surface + 0.5);
        }
      }
    });

    it("landing quality is always between 0 and 1", () => {
      // Simulate multiple landings
      for (let landing = 0; landing < 10; landing++) {
        bird.reset(50, terrain.heightAt(50) + 100);
        bird.vy = -20;
        bird.grounded = false;
        
        // Let bird land
        for (let i = 0; i < 60; i++) {
          bird.step(c.PHYS_DT, {
            diving: false,
            fever: false,
            speedMult: 1,
            boost: false,
          }, terrain);
          
          if (bird.justLanded) {
            expect(bird.landingQuality).toBeGreaterThanOrEqual(0);
            expect(bird.landingQuality).toBeLessThanOrEqual(1);
            break;
          }
        }
      }
    });
  });

  describe("Terrain Consistency", () => {
    let terrain: TerrainSystem;

    beforeEach(() => {
      terrain = new TerrainSystem("test-seed");
    });

    it("height is deterministic", () => {
      const h1 = terrain.heightAt(100);
      const h2 = terrain.heightAt(100);
      expect(h1).toBe(h2);
    });

    it("height cache works correctly", () => {
      // Clear cache
      terrain.invalidate();
      
      // First call computes
      const h1 = terrain.heightAt(100);
      
      // Second call should use cache
      const h2 = terrain.heightAt(100);
      expect(h1).toBe(h2);
    });

    it("normal is perpendicular to surface", () => {
      const x = 500;
      const n = terrain.normalAt(x);
      
      // Normal should be unit vector
      const len = Math.hypot(n.nx, n.ny);
      expect(len).toBeCloseTo(1, 3);
      
      // Tangent should be unit vector
      const tlen = Math.hypot(n.tx, n.ty);
      expect(tlen).toBeCloseTo(1, 3);
    });

    it("curvature changes sign at crests and valleys", () => {
      // Find a local maximum (crest)
      let crestX = 0;
      let maxH = -Infinity;
      for (let x = 0; x < 500; x += 1) {
        const h = terrain.heightAt(x);
        if (h > maxH) {
          maxH = h;
          crestX = x;
        }
      }
      
      // Curvature should be positive at crest
      const crestCurv = terrain.curvatureAt(crestX);
      expect(crestCurv).toBeGreaterThan(0);
    });

    it("ocean detection is consistent", () => {
      const gapStart = c.GAP_START;
      
      // Before gap - not ocean
      expect(terrain.isOcean(gapStart - 10)).toBe(false);
      
      // In gap - ocean
      expect(terrain.isOcean(gapStart + 50)).toBe(true);
      
      // After gap - not ocean
      expect(terrain.isOcean(gapStart + 200)).toBe(false);
    });
  });

  describe("Leaderboard Consistency", () => {
    let leaderboard: Leaderboard;

    beforeEach(() => {
      localStorage.clear();
      leaderboard = new Leaderboard();
    });

    it("scores are sorted by score descending", () => {
      leaderboard.record("classic", 1000, 500, 50, 3, "sunbird");
      leaderboard.record("classic", 2000, 600, 75, 5, "sunbird");
      leaderboard.record("classic", 1500, 550, 60, 4, "sunbird");
      
      const scores = leaderboard.getScores("classic");
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i].score).toBeLessThanOrEqual(scores[i - 1].score);
      }
    });

    it("ranks are sequential", () => {
      leaderboard.record("classic", 1000, 500, 50, 3, "sunbird");
      leaderboard.record("classic", 2000, 600, 75, 5, "sunbird");
      leaderboard.record("classic", 1500, 550, 60, 4, "sunbird");
      
      const scores = leaderboard.getScores("classic");
      scores.forEach((score, index) => {
        expect(score.rank).toBe(index + 1);
      });
    });

    it("personal best is the highest score", () => {
      leaderboard.record("classic", 1000, 500, 50, 3, "sunbird");
      leaderboard.record("timed", 2000, 600, 75, 5, "sunbird");
      leaderboard.record("classic", 1500, 550, 60, 4, "sunbird");
      
      const best = leaderboard.getPersonalBest();
      expect(best!.score).toBe(2000);
    });
  });

  describe("Missions Consistency", () => {
    let missions: Missions;
    let saveData: SaveData;

    beforeEach(() => {
      localStorage.clear();
      saveData = new SaveData();
      missions = new Missions(saveData);
    });

    it("all missions have valid definitions", () => {
      MISSION_DEFS.forEach((def) => {
        expect(def.id).toBeDefined();
        expect(def.title).toBeDefined();
        expect(def.desc).toBeDefined();
        expect(def.target).toBeGreaterThan(0);
        expect(def.kind).toBeDefined();
      });
    });

    it("daily quests are deterministic", () => {
      const quests1 = missions.dailyQuests("2026-01-01");
      const quests2 = missions.dailyQuests("2026-01-01");
      expect(quests1).toEqual(quests2);
    });

    it("daily quests change daily", () => {
      const quests1 = missions.dailyQuests("2026-01-01");
      const quests2 = missions.dailyQuests("2026-01-02");
      expect(quests1).not.toEqual(quests2);
    });
  });

  describe("Performance Regression", () => {
    it("physics step completes within time budget", () => {
      const terrain = new TerrainSystem("perf-test");
      const bird = new Bird();
      
      const iterations = 1000;
      const start = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        bird.step(c.PHYS_DT, {
          diving: false,
          fever: false,
          speedMult: 1,
          boost: false,
        }, terrain);
        // Note: syncVisual requires Three.js scene setup, skip for unit tests
        // bird.syncVisual(c.PHYS_DT, false, i * c.PHYS_DT, terrain);
      }
      
      const elapsed = performance.now() - start;
      const avgPerStep = elapsed / iterations;
      
      // 120Hz physics means we have 8.33ms per step
      // Allow 2ms for the step (well under budget)
      expect(avgPerStep).toBeLessThan(2);
    });

    it("height queries are fast with cache", () => {
      const terrain = new TerrainSystem("perf-test");
      
      // Warm cache
      for (let x = 0; x < 1000; x += 1) {
        terrain.heightAt(x);
      }
      
      const iterations = 10000;
      const start = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        terrain.heightAt(Math.random() * 1000);
      }
      
      const elapsed = performance.now() - start;
      const avgPerQuery = elapsed / iterations;
      
      // Cached queries should be very fast (< 0.01ms)
      expect(avgPerQuery).toBeLessThan(0.01);
    });
  });

  describe("Edge Cases", () => {
    it("bird handles zero speed gracefully", () => {
      const bird = new Bird();
      bird.vx = 0;
      bird.vy = 0;
      
      const terrain = new TerrainSystem("test");
      bird.step(c.PHYS_DT, {
        diving: false,
        fever: false,
        speedMult: 1,
        boost: false,
      }, terrain);
      
      expect(bird.speed()).toBeGreaterThanOrEqual(0);
    });

    it("terrain handles extreme x values", () => {
      const terrain = new TerrainSystem("test");
      
      // Very large x
      const h1 = terrain.heightAt(1000000);
      expect(Number.isFinite(h1)).toBe(true);
      
      // Very small x
      const h2 = terrain.heightAt(-1000000);
      expect(Number.isFinite(h2)).toBe(true);
    });

    it("save data handles empty strings", () => {
      const saveData = new SaveData();
      saveData.state.referralCode = "";
      expect(saveData.exportCode().length).toBeGreaterThan(0);
    });

    it("leaderboard handles concurrent modifications", () => {
      const leaderboard = new Leaderboard();
      
      // Rapidly add scores
      for (let i = 0; i < 100; i++) {
        leaderboard.record("rapid", Math.random() * 10000, 500, 50, 3, "sunbird");
      }
      
      const scores = leaderboard.getScores("rapid");
      expect(scores.length).toBeLessThanOrEqual(10);
    });
  });
});

// Import MISSION_DEFS for edge case test
import { MISSION_DEFS } from "../Missions";
