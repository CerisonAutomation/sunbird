import { describe, it, expect, beforeEach } from "vitest";
import { Leaderboard } from "../Leaderboard";

describe("Leaderboard", () => {
  let leaderboard: Leaderboard;

  beforeEach(() => {
    localStorage.clear();
    leaderboard = new Leaderboard();
  });

  describe("record", () => {
    it("records a score and returns rank", () => {
      const result = leaderboard.record("classic", 1000, 500, 50, 3, "sunbird");
      expect(result.rank).toBe(1);
      expect(result.isNewBest).toBe(true);
    });

    it("returns correct rank for multiple scores", () => {
      leaderboard.record("classic", 1000, 500, 50, 3, "sunbird");
      leaderboard.record("classic", 2000, 600, 75, 5, "sunbird");
      leaderboard.record("classic", 1500, 550, 60, 4, "sunbird");
      
      const result = leaderboard.record("classic", 1800, 580, 70, 4, "sunbird");
      expect(result.rank).toBe(2);
      expect(result.isNewBest).toBe(false);
    });

    it("limits to 10 entries per mode", () => {
      for (let i = 0; i < 15; i++) {
        leaderboard.record("classic", 100 + i, 50 + i, 10 + i, 1, "sunbird");
      }
      const scores = leaderboard.getScores("classic");
      expect(scores.length).toBe(10);
    });

    it("sorts by score descending", () => {
      leaderboard.record("classic", 100, 50, 10, 1, "sunbird");
      leaderboard.record("classic", 200, 60, 20, 2, "sunbird");
      leaderboard.record("classic", 150, 55, 15, 1, "sunbird");
      
      const scores = leaderboard.getScores("classic");
      expect(scores[0].score).toBe(200);
      expect(scores[1].score).toBe(150);
      expect(scores[2].score).toBe(100);
    });

    it("updates ranks after insertion", () => {
      leaderboard.record("classic", 100, 50, 10, 1, "sunbird");
      leaderboard.record("classic", 200, 60, 20, 2, "sunbird");
      
      const scores = leaderboard.getScores("classic");
      expect(scores[0].rank).toBe(1);
      expect(scores[1].rank).toBe(2);
    });
  });

  describe("getScores", () => {
    it("returns empty array for unknown mode", () => {
      const scores = leaderboard.getScores("unknown");
      expect(scores).toEqual([]);
    });

    it("returns scores for known mode", () => {
      leaderboard.record("classic", 1000, 500, 50, 3, "sunbird");
      const scores = leaderboard.getScores("classic");
      expect(scores.length).toBe(1);
    });
  });

  describe("getPersonalBest", () => {
    it("returns null when no scores", () => {
      const best = leaderboard.getPersonalBest();
      expect(best).toBeNull();
    });

    it("returns highest score across all modes", () => {
      leaderboard.record("classic", 1000, 500, 50, 3, "sunbird");
      leaderboard.record("timed", 1500, 600, 75, 5, "sunbird");
      leaderboard.record("classic", 800, 400, 40, 2, "sunbird");
      
      const best = leaderboard.getPersonalBest();
      expect(best).not.toBeNull();
      expect(best!.score).toBe(1500);
    });
  });

  describe("getBestDistance", () => {
    it("returns 0 when no scores", () => {
      const distance = leaderboard.getBestDistance();
      expect(distance).toBe(0);
    });

    it("returns highest distance across all modes", () => {
      leaderboard.record("classic", 1000, 500, 50, 3, "sunbird");
      leaderboard.record("timed", 800, 800, 75, 5, "sunbird");
      
      const distance = leaderboard.getBestDistance();
      expect(distance).toBe(800);
    });
  });

  describe("getStats", () => {
    it("returns correct statistics", () => {
      leaderboard.record("classic", 1000, 500, 50, 3, "sunbird");
      leaderboard.record("classic", 1200, 600, 60, 4, "sunbird");
      leaderboard.record("timed", 800, 400, 40, 2, "sunbird");
      
      const stats = leaderboard.getStats();
      expect(stats.totalRuns).toBe(3);
      expect(stats.totalDistance).toBe(1500);
      expect(stats.totalCoins).toBe(150);
      expect(stats.totalPerfects).toBe(9);
      expect(stats.bestScore).toBe(1200);
      expect(stats.bestDistance).toBe(600);
      expect(stats.modesPlayed).toBe(2);
    });

    it("returns zeros when empty", () => {
      const stats = leaderboard.getStats();
      expect(stats.totalRuns).toBe(0);
      expect(stats.totalDistance).toBe(0);
      expect(stats.modesPlayed).toBe(0);
    });
  });

  describe("Persistence", () => {
    it("persists to localStorage", () => {
      leaderboard.record("classic", 1000, 500, 50, 3, "sunbird");
      // Verify that data persists by creating a new instance
      const newLeaderboard = new Leaderboard();
      const scores = newLeaderboard.getScores("classic");
      expect(scores.length).toBe(1);
      expect(scores[0].score).toBe(1000);
    });

    it("loads from localStorage", () => {
      leaderboard.record("classic", 1000, 500, 50, 3, "sunbird");
      const newLeaderboard = new Leaderboard();
      const scores = newLeaderboard.getScores("classic");
      expect(scores.length).toBe(1);
      expect(scores[0].score).toBe(1000);
    });
  });

  describe("clear", () => {
    it("clears all scores", () => {
      leaderboard.record("classic", 1000, 500, 50, 3, "sunbird");
      leaderboard.record("timed", 1200, 600, 60, 4, "sunbird");
      
      leaderboard.clear();
      
      expect(leaderboard.getScores("classic")).toEqual([]);
      expect(leaderboard.getScores("timed")).toEqual([]);
      expect(leaderboard.getPersonalBest()).toBeNull();
    });
  });
});
