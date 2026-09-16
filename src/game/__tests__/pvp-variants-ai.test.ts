import { describe, expect, it } from "vitest";
import { isRaceMode, modeById, PVP_MODES } from "../Modes";
import { MassRace, type AIArchetype } from "../MassRace";
import { TerrainSystem } from "../TerrainSystem";

describe("PvP Variants and Offline Neural AI Engine", () => {
  it("defines and resolves all 4 competitive PvP variants", () => {
    expect(PVP_MODES).toHaveLength(4);
    const sprint = modeById("pvp_sprint");
    expect(sprint.name).toBe("Sprint GP");
    expect(sprint.finish).toBe(1500);
    expect(isRaceMode("pvp_sprint")).toBe(true);

    const endurance = modeById("pvp_endurance");
    expect(endurance.name).toBe("Grand Migration");
    expect(endurance.finish).toBe(6000);
    expect(isRaceMode("pvp_endurance")).toBe(true);

    const knockout = modeById("pvp_knockout");
    expect(knockout.name).toBe("Knockout Royale");
    expect(knockout.finish).toBe(4000);
    expect(isRaceMode("pvp_knockout")).toBe(true);

    const draft = modeById("pvp_draft");
    expect(draft.name).toBe("Tempest Draft");
    expect(draft.finish).toBe(3500);
    expect(isRaceMode("pvp_draft")).toBe(true);
  });

  it("spawns 40 AI rivals with diverse archetypes and tiered skills without any server", () => {
    const race = new MassRace();
    const terrain = new TerrainSystem("pvp-seed-1");
    race.spawn(40, "test-pvp-seed", terrain, 64);

    expect(race.fieldSize).toBe(40);
    expect(race.rivals).toHaveLength(40);

    const archetypes = new Set<AIArchetype>(race.rivals.map((r) => r.archetype));
    expect(archetypes.has("apex")).toBe(true);
    expect(archetypes.has("draft_hunter")).toBe(true);
    expect(archetypes.has("soarer")).toBe(true);
    expect(archetypes.has("daredevil")).toBe(true);
    expect(archetypes.has("pacer")).toBe(true);

    // Verify top tier rivals have higher skill than tail tier
    const topTierSkill = race.rivals.slice(0, 5).reduce((acc, r) => acc + r.skill, 0) / 5;
    const tailTierSkill = race.rivals.slice(30).reduce((acc, r) => acc + r.skill, 0) / 10;
    expect(topTierSkill).toBeGreaterThan(tailTierSkill);
    race.dispose();
  });

  it("simulates intelligent downslope diving and slipstream slingshots locally", () => {
    const race = new MassRace();
    const terrain = new TerrainSystem("pvp-seed-2");
    race.spawn(10, "test-sim-seed", terrain, 64);

    // Simulate 3 seconds of race physics with the player leading at x=100
    for (let i = 0; i < 180; i++) {
      race.step(1 / 60, terrain, 4000, i / 60, 100 + i * 0.5, 30);
    }

    // All active AI rivals should have progressed along the terrain
    for (let i = 0; i < race.rivals.length; i++) {
      const r = race.rivals[i]!;
      expect(r.bird.x).toBeGreaterThan(64);
      expect(Number.isFinite(r.bird.x)).toBe(true);
      expect(Number.isFinite(r.bird.y)).toBe(true);
    }
    race.dispose();
  });

  it("supports Tempest Draft configuration with supercharged draft radius and multiplier", () => {
    const race = new MassRace();
    expect(race.draftBehind).toBe(26);

    race.configureMode("pvp_draft");
    expect(race.draftBehind).toBe(38);
    expect(race.draftMax).toBe(0.85);

    race.configureMode("massrace");
    expect(race.draftBehind).toBe(26);
    expect(race.draftMax).toBe(0.55);
    race.dispose();
  });

  it("eliminates trailing rivals in Knockout Royale while preserving podium contenders", () => {
    const race = new MassRace();
    const terrain = new TerrainSystem("pvp-seed-3");
    race.spawn(10, "knockout-seed", terrain, 64);

    // Artificially space birds
    race.rivals.forEach((r, idx) => {
      r.bird.x = 100 + idx * 50;
    });

    // Lowest bird is at x=100
    const eliminated = race.eliminateTrailing(500);
    expect(eliminated).not.toBeNull();
    expect(eliminated!.eliminated).toBe(true);
    expect(eliminated!.alive).toBe(false);

    // Roster and standings should no longer list the eliminated bird
    const roster = race.roster(250, 64, 4000, "You");
    expect(roster.some((b) => b.id === eliminated!.id)).toBe(false);

    race.dispose();
  });

  it("eliminates trailing rivals even if all AI birds are past the distance threshold", () => {
    const race = new MassRace();
    const terrain = new TerrainSystem("pvp-seed-4");
    race.spawn(5, "knockout-speed-seed", terrain, 64);

    // All birds are past 500m
    race.rivals[0]!.bird.x = 650;
    race.rivals[1]!.bird.x = 700;
    race.rivals[2]!.bird.x = 750;
    race.rivals[3]!.bird.x = 800;
    race.rivals[4]!.bird.x = 850;

    // Checkpoint at 500m eliminates the lowest bird (at 650m)
    const eliminated = race.eliminateTrailing(500);
    expect(eliminated).not.toBeNull();
    expect(eliminated!.id).toBe(race.rivals[0]!.id);
    expect(eliminated!.eliminated).toBe(true);

    // Subsequent checkpoint eliminates the next lowest
    const second = race.eliminateTrailing(1000);
    expect(second).not.toBeNull();
    expect(second!.id).toBe(race.rivals[1]!.id);
    expect(second!.eliminated).toBe(true);

    race.dispose();
  });
});
