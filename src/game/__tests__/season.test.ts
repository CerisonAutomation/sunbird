import { describe, expect, it } from "vitest";
import { seasonId, seasonLabel } from "../season";

describe("season identity", () => {
  it("keys a date to its YYYY-MM season", () => {
    // Season ids follow the player-local day (same convention as dateSeed),
    // so construct boundary dates from local parts — UTC-string literals
    // would shift a day on non-UTC machines and fail both directions.
    expect(seasonId(new Date(2026, 8, 12))).toBe("2026-09");
    expect(seasonId(new Date(2026, 0, 1))).toBe("2026-01");
    expect(seasonId(new Date(2025, 11, 31, 23, 59, 59))).toBe("2025-12");
  });

  it("zero-pads single-digit months", () => {
    expect(seasonId(new Date(2026, 2, 5))).toBe("2026-03");
  });

  it("labels a season", () => {
    expect(seasonLabel("2026-09")).toBe("Sep 2026");
    expect(seasonLabel("2026-01")).toBe("Jan 2026");
  });
});
