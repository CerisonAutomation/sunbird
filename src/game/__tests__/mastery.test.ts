import { describe, expect, it } from "vitest";
import { MASTERY_LEVELS, MASTERY_REWARDS, masteryLevel } from "../Mastery";

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
