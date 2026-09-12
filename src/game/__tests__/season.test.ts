import { describe, expect, it } from "vitest";
import { seasonId, seasonLabel } from "../season";

describe("season identity", () => {
  it("keys a date to its YYYY-MM season", () => {
    expect(seasonId(new Date("2026-09-12T10:00:00Z"))).toBe("2026-09");
    expect(seasonId(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
    expect(seasonId(new Date("2025-12-31T23:59:59Z"))).toBe("2025-12");
  });

  it("zero-pads single-digit months", () => {
    expect(seasonId(new Date("2026-03-05T00:00:00Z"))).toBe("2026-03");
  });

  it("labels a season", () => {
    expect(seasonLabel("2026-09")).toBe("September 2026");
    expect(seasonLabel("2026-01")).toBe("January 2026");
    expect(seasonLabel("2026-12")).toBe("December 2026");
  });

  it("round-trips a malformed season id instead of 'undefined'", () => {
    expect(seasonLabel("2026-13")).toBe("2026-13");
    expect(seasonLabel("2026-00")).toBe("2026-00");
    expect(seasonLabel("not-a-season")).toBe("not-a-season");
  });
});
