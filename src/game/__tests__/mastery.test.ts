import { describe, expect, it } from "vitest";
import { MASTERY_COIN_PER_LEVEL, MASTERY_LEVELS, MASTERY_REWARDS, MASTERY_SKILLS, masteryLevel } from "../Mastery";
import { MODES } from "../Modes";

describe("masteryLevel", () => {
  it("starts at 0 and reaches 5 at 100 runs", () => {
    expect(masteryLevel(0)).toBe(0);
    expect(masteryLevel(2)).toBe(0);
    expect(masteryLevel(3)).toBe(1);
    expect(masteryLevel(100)).toBe(5);
    expect(masteryLevel(9999)).toBe(5);
  });

  it("levels and rewards line up and escalate", () => {
    expect(MASTERY_REWARDS).toHaveLength(MASTERY_LEVELS.length);
    for (let i = 1; i < MASTERY_REWARDS.length; i++) {
      expect(MASTERY_REWARDS[i]!).toBeGreaterThan(MASTERY_REWARDS[i - 1]!);
      expect(MASTERY_LEVELS[i]!).toBeGreaterThan(MASTERY_LEVELS[i - 1]!);
    }
  });
});

describe("mastery signature skills", () => {
  it("every mode has a level-5 signature skill with a name and description", () => {
    for (const m of MODES) {
      const skill = MASTERY_SKILLS[m.id];
      expect(skill, `mode ${m.id} is missing a signature skill`).toBeDefined();
      expect(skill!.name.length).toBeGreaterThan(3);
      expect(skill!.desc.length).toBeGreaterThan(5);
    }
  });

  it("skill names are unique across modes", () => {
    const names = Object.values(MASTERY_SKILLS).map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("max-level perks stay within fair-play caps", () => {
    for (const [id, skill] of Object.entries(MASTERY_SKILLS)) {
      // Perks must never regress below the level-4 coin bonus and stay modest (no grind-to-win blowouts).
      expect(skill.coinMult, `${id} coinMult`).toBeGreaterThanOrEqual(1 + 4 * MASTERY_COIN_PER_LEVEL);
      expect(skill.coinMult, `${id} coinMult`).toBeLessThanOrEqual(1.2);
      expect(skill.liftMult, `${id} liftMult`).toBeGreaterThanOrEqual(1);
      expect(skill.liftMult, `${id} liftMult`).toBeLessThanOrEqual(1.03);
      expect(skill.daylightBonus, `${id} daylight`).toBeGreaterThanOrEqual(0);
      expect(skill.daylightBonus, `${id} daylight`).toBeLessThanOrEqual(6);
      expect(skill.feverBonus, `${id} fever`).toBeGreaterThanOrEqual(0);
      expect(skill.feverBonus, `${id} fever`).toBeLessThanOrEqual(3);
    }
  });

  it("every skill grants something real", () => {
    for (const [id, s] of Object.entries(MASTERY_SKILLS)) {
      const potency = (s.coinMult - 1) + (s.liftMult - 1) + s.daylightBonus + s.feverBonus;
      expect(potency, `${id} skill is decorative`).toBeGreaterThan(0.05);
    }
  });
});
