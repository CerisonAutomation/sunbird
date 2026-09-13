import { describe, it, expect, beforeEach } from "vitest";
import { Missions, MISSION_DEFS, type RunStats } from "../Missions";
import { SaveData } from "../SaveData";

describe("Missions", () => {
  let missions: Missions;
  let saveData: SaveData;

  beforeEach(() => {
    localStorage.clear();
    saveData = new SaveData();
    missions = new Missions(saveData);
  });

  describe("view", () => {
    it("returns all mission definitions", () => {
      const view = missions.view(null);
      expect(view.length).toBe(MISSION_DEFS.length);
    });

    it("shows progress for each mission", () => {
      const view = missions.view(null);
      view.forEach((v) => {
        expect(v.def).toBeDefined();
        expect(v.progress).toBe(0);
        expect(v.done).toBe(false);
        expect(v.completedBefore).toBe(false);
      });
    });

    it("calculates progress from stats", () => {
      const stats: RunStats = {
        clouds: 3,
        island: 2,
        coins: 20,
        perfects: 4,
        fever: 1,
        zenith: 2,
        distance: 1500,
        pickups: 5,
      };
      
      const view = missions.view(stats);
      
      // Check clouds mission (target: 5)
      const cloudsMission = view.find((v) => v.def.id === "clouds5");
      expect(cloudsMission).toBeDefined();
      expect(cloudsMission!.progress).toBe(3);
      expect(cloudsMission!.done).toBe(false);
      
      // Check island mission (target: 3)
      const islandMission = view.find((v) => v.def.id === "island3");
      expect(islandMission).toBeDefined();
      expect(islandMission!.progress).toBe(2);
    });

    it("marks completed missions", () => {
      saveData.completeMission("clouds5");
      const view = missions.view(null);
      const cloudsMission = view.find((v) => v.def.id === "clouds5");
      expect(cloudsMission!.completedBefore).toBe(true);
      expect(cloudsMission!.done).toBe(true);
    });
  });

  describe("applyRun", () => {
    it("completes missions when stats meet target", () => {
      const stats: RunStats = {
        clouds: 5,
        island: 3,
        coins: 25,
        perfects: 5,
        fever: 1,
        zenith: 3,
        distance: 2000,
        pickups: 6,
      };
      
      const completed = missions.applyRun(stats);
      expect(completed.length).toBeGreaterThan(0);
      expect(completed).toContain("clouds5");
      expect(completed).toContain("island3");
      expect(completed).toContain("coins25");
      expect(completed).toContain("perfects5");
      expect(completed).toContain("fever1");
      expect(completed).toContain("zenith3");
      expect(completed).toContain("distance2k");
      expect(completed).toContain("pickups6");
    });

    it("does not complete missions when stats are insufficient", () => {
      const stats: RunStats = {
        clouds: 4,
        island: 2,
        coins: 24,
        perfects: 4,
        fever: 0,
        zenith: 2,
        distance: 1999,
        pickups: 5,
      };
      
      const completed = missions.applyRun(stats);
      expect(completed.length).toBe(0);
    });

    it("returns empty array on first run", () => {
      const stats: RunStats = {
        clouds: 0,
        island: 0,
        coins: 0,
        perfects: 0,
        fever: 0,
        zenith: 0,
        distance: 0,
        pickups: 0,
      };
      
      const completed = missions.applyRun(stats);
      expect(completed.length).toBe(0);
    });
  });

  describe("dailyQuests", () => {
    it("returns 3 quests for non-VIP", () => {
      const quests = missions.dailyQuests("2026-01-01");
      expect(quests.length).toBe(3);
    });

    it("returns 4 quests for VIP", () => {
      saveData.grantVip(30);
      const quests = missions.dailyQuests("2026-01-01");
      expect(quests.length).toBe(4);
    });

    it("returns same quests for same date", () => {
      const quests1 = missions.dailyQuests("2026-01-01");
      const quests2 = missions.dailyQuests("2026-01-01");
      expect(quests1).toEqual(quests2);
    });

    it("returns different quests for different dates", () => {
      const quests1 = missions.dailyQuests("2026-01-01");
      const quests2 = missions.dailyQuests("2026-01-02");
      expect(quests1).not.toEqual(quests2);
    });

    it("ensures unique quest kinds", () => {
      const quests = missions.dailyQuests("2026-01-01");
      const kinds = quests.map((q) => q.kind);
      const uniqueKinds = new Set(kinds);
      expect(uniqueKinds.size).toBe(quests.length);
    });
  });

  describe("questView", () => {
    it("shows progress for each quest", () => {
      const stats: RunStats = {
        clouds: 3,
        island: 2,
        coins: 20,
        perfects: 4,
        fever: 1,
        zenith: 2,
        distance: 1500,
        pickups: 5,
      };
      
      const view = missions.questView("2026-01-01", stats);
      expect(view.length).toBe(3);
      
      view.forEach((v) => {
        expect(v.def).toBeDefined();
        expect(v.progress).toBeGreaterThanOrEqual(0);
        expect(typeof v.done).toBe("boolean");
        expect(typeof v.claimed).toBe("boolean");
      });
    });

    it("marks quests as done when target met", () => {
      // Create stats that complete all quests
      const stats: RunStats = {
        clouds: 100,
        island: 100,
        coins: 100,
        perfects: 100,
        fever: 100,
        zenith: 100,
        distance: 100000,
        pickups: 100,
      };
      
      const view = missions.questView("2026-01-01", stats);
      view.forEach((v) => {
        expect(v.done).toBe(true);
      });
    });
  });

  describe("claimQuests", () => {
    it("claims completed quests and gives rewards", () => {
      // Create stats that complete all quests
      const stats: RunStats = {
        clouds: 100,
        island: 100,
        coins: 100,
        perfects: 100,
        fever: 100,
        zenith: 100,
        distance: 100000,
        pickups: 100,
      };
      
      const rewards = missions.claimQuests("2026-01-01", stats);
      expect(rewards.length).toBe(3);
      
      rewards.forEach((r) => {
        expect(r.id).toBeDefined();
        expect(r.reward).toBeGreaterThan(0);
        expect(r.label).toBeDefined();
      });
    });

    it("does not claim already claimed quests", () => {
      const stats: RunStats = {
        clouds: 100,
        island: 100,
        coins: 100,
        perfects: 100,
        fever: 100,
        zenith: 100,
        distance: 100000,
        pickups: 100,
      };
      
      missions.claimQuests("2026-01-01", stats);
      const rewards = missions.claimQuests("2026-01-01", stats);
      expect(rewards.length).toBe(0);
    });

    it("does not claim incomplete quests", () => {
      const stats: RunStats = {
        clouds: 0,
        island: 0,
        coins: 0,
        perfects: 0,
        fever: 0,
        zenith: 0,
        distance: 0,
        pickups: 0,
      };
      
      const rewards = missions.claimQuests("2026-01-01", stats);
      expect(rewards.length).toBe(0);
    });
  });
});
