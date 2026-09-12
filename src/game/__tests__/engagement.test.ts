import { beforeEach, describe, expect, it } from "vitest";
import { FlowTuner, SessionGoals, evaluateNearMiss } from "../Engagement";
import { SaveData } from "../SaveData";

describe("FlowTuner", () => {
  let save: SaveData;

  beforeEach(() => {
    localStorage.clear();
    save = new SaveData();
  });

  it("loads persisted skill clamped to [0,1]", () => {
    save.state.skill = 2.5;
    save.state.skillSamples = 7;
    const t = new FlowTuner();
    t.load(save);
    expect(t.skill).toBe(1);
    expect(t.difficulty()).toBeCloseTo(1.16, 2);
  });

  it("starts at the default and persists after a run", () => {
    const t = new FlowTuner();
    t.load(save);
    expect(t.skill).toBe(0.25);
    t.noteRun(2000, 5, 10, save);
    expect(save.state.skill).toBe(t.skill);
    expect(save.state.skillSamples).toBe(1);
    expect(t.difficulty()).toBeGreaterThanOrEqual(0.86);
    expect(t.difficulty()).toBeLessThanOrEqual(1.16);
  });

  it("labels skill bands monotonically", () => {
    const t = new FlowTuner();
    const labels = [0, 0.19, 0.2, 0.39, 0.4, 0.59, 0.6, 0.79, 0.8].map((s) => {
      t.skill = s;
      return t.label();
    });
    expect(labels).toEqual([
      "Fledgling", "Fledgling",
      "Glider", "Glider",
      "Skyrider", "Skyrider",
      "Windmaster", "Windmaster",
      "Sunbird",
    ]);
  });
});

describe("SessionGoals", () => {
  it("always produces three goals with distinct kinds", () => {
    const tuner = new FlowTuner();
    tuner.skill = 0.5;
    const g = new SessionGoals(tuner);
    g.reset("seed");
    expect(g.goals).toHaveLength(3);
    expect(new Set(g.goals.map((x) => x.kind)).size).toBe(3);
    for (const goal of g.goals) {
      expect(goal.target).toBeGreaterThan(0);
      expect(goal.label.length).toBeGreaterThan(0);
    }
  });

  it("refills a completed goal immediately (list never empties)", () => {
    const tuner = new FlowTuner();
    tuner.skill = 0.5;
    const g = new SessionGoals(tuner);
    g.reset("seed");
    const first = g.goals[0]!;
    const finished = g.update({ [first.kind]: first.target + 100 } as never);
    expect(finished).toHaveLength(1);
    expect(g.goals).toHaveLength(3);
    // The completed goal was swapped out for a fresh, uncompleted one.
    expect(g.goals.every((x) => !x.done)).toBe(true);
  });

  it("closest() returns a nearly-done goal and null when none is close", () => {
    const tuner = new FlowTuner();
    tuner.skill = 0.5;
    const g = new SessionGoals(tuner);
    g.reset("seed");
    expect(g.closest()).toBeNull();
    const goal = g.goals[0]!;
    goal.progress = Math.ceil(goal.target * 0.6);
    expect(g.closest()?.kind).toBe(goal.kind);
  });
});

describe("evaluateNearMiss", () => {
  it("fires distance near-miss only within 12%", () => {
    const near = evaluateNearMiss(950, 1000, 0, 0, 0, 0);
    expect(near.kind).toBe("distance");
    const far = evaluateNearMiss(500, 1000, 0, 0, 0, 0);
    expect(far.kind).toBe("none");
  });

  it("fires altitude near-miss only within 10%", () => {
    expect(evaluateNearMiss(0, 0, 95, 100, 0, 0).kind).toBe("altitude");
    expect(evaluateNearMiss(0, 0, 50, 100, 0, 0).kind).toBe("none");
  });

  it("fires combo near-miss one short of the record", () => {
    expect(evaluateNearMiss(0, 0, 0, 0, 4, 5).kind).toBe("combo");
    expect(evaluateNearMiss(0, 0, 0, 0, 3, 5).kind).toBe("none");
  });

  it("returns none when there is no record to chase", () => {
    expect(evaluateNearMiss(500, 0, 0, 0, 0, 0).kind).toBe("none");
  });
});
