import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COLLECTIONS, SKINS } from "../Economy";
import { ACHIEVEMENTS } from "../Achievements";

// jsdom replaces the global URL class, so `new URL(..., import.meta.url)`
// throws "The URL must be of scheme file" here. fileURLToPath on the real
// import.meta.url is the reliable route to this directory.
import { fileURLToPath } from "node:url";
const CSS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../ui.css"),
  "utf8",
);

const rule = (sel: string): string => {
  const m = CSS.match(new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`));
  expect(m, `${sel} not found in ui.css`).not.toBeNull();
  return m![1]!;
};

/** How many items land in the last row, given a column count. */
const lastRow = (n: number, cols: number) => n % cols;

describe("grids fed by variable-length data use auto-fit, not a fixed count", () => {
  it("the shop bird wall really is uneven, so a fixed column count cannot work", () => {
    const counts = new Map<string, number>();
    for (const s of SKINS) {
      const c = s.collection ?? "starter";
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const sizes = COLLECTIONS.map((c) => counts.get(c.id) ?? 0).filter(Boolean);
    expect(sizes.length).toBeGreaterThan(4);
    // Every collection is ragged at 3 columns — that is the bug this pins.
    expect(sizes.filter((n) => lastRow(n, 3) !== 0).length).toBe(sizes.length);
    // Starter is a single bird; a fixed 3-column grid stranded two empty cells
    // beside it, which is the "1x0" hole in the shop.
    expect(Math.min(...sizes)).toBe(1);
  });

  it("achievement groups are uneven too", () => {
    const byRarity = new Map<string, number>();
    for (const a of ACHIEVEMENTS) {
      const r = a.rarity ?? "?";
      byRarity.set(r, (byRarity.get(r) ?? 0) + 1);
    }
    expect(byRarity.size).toBeGreaterThanOrEqual(4);
    const odd = [...byRarity.values()].filter((n) => n % 2 !== 0);
    expect(odd.length, "expected some odd-sized rarity groups").toBeGreaterThan(0);
  });

  it("the menu's own two grids were ragged too", () => {
    // "More ways to fly" holds exactly three cards — PVP, PVE, Tournament.
    expect(lastRow(3, 2)).toBe(1);
    // The nav holds fifteen buttons; at four columns that is three full rows
    // plus a fourth with three buttons and one empty cell.
    expect(lastRow(15, 4)).toBe(3);
    expect(4 - lastRow(15, 4)).toBe(1);
    // Both divide evenly at some column count (3 and 5 for the nav), but the
    // counts are not contractually fixed, so auto-fit is the durable answer.
    expect(lastRow(15, 5)).toBe(0);
  });

  it.each([".skin-grid", ".trophy-grid", ".flock-grid", ".mode-cards", ".nav-grid.compact"])(
    "%s uses repeat(auto-fit, minmax(...))",
    (sel) => {
      const body = rule(sel);
      expect(body).toMatch(/repeat\(\s*auto-fit\s*,\s*minmax\(\s*\d+px\s*,\s*1fr\s*\)\s*\)/);
      // A bare repeat(N, ...) anywhere in the same rule would reintroduce it.
      expect(body).not.toMatch(/repeat\(\s*\d+\s*,/);
    },
  );

  it("no fixed-column override survives for the bird wall at any breakpoint", () => {
    // There used to be a @media (max-width: 480px) { .skin-grid { repeat(2, ...) } }
    // which would have re-fixed the columns on phones.
    const skinGridBlocks = [...CSS.matchAll(/\.skin-grid\s*\{([^}]*)\}/g)];
    expect(skinGridBlocks.length).toBeGreaterThan(0);
    for (const b of skinGridBlocks) {
      expect(b[1]).not.toMatch(/repeat\(\s*\d+\s*,/);
    }
  });
});
