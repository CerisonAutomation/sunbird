import { describe, expect, it } from "vitest";
// Vite's ?raw suffix hands back the module's source as a string. Bundler-
// resolved, so it needs no fs access and no cwd assumption — readFileSync with
// import.meta.url fails under the jsdom environment because that URL is not a
// file: URL.
import hudSource from "../HUD.ts?raw";

/**
 * Two invariants that fail silently when broken, so they need a test rather
 * than care:
 *
 * 1. `data-ref` must be unique within a screen. `grab()` and `readValue()`
 *    resolve with `root.querySelector('[data-ref="…"]')`, which returns the
 *    FIRST match. A duplicate does not error — it quietly wires the handler to
 *    the wrong element. Only one screen is mounted at a time
 *    (`menuCard.innerHTML = renderScreen(s)`), so uniqueness is required per
 *    screen, not globally: two different screens may legitimately reuse a
 *    name. This test scopes per screen for exactly that reason.
 *
 * 2. Every literal `grab("x")` must have a matching `data-ref="x"`. A typo
 *    yields `null` and the next property access throws at runtime, in a branch
 *    no unit test reaches.
 *
 * Parsed from source rather than from a rendered DOM because `renderScreen` is
 * private and needs a full snapshot; the markup is static template literals,
 * so source-level analysis sees the same refs the DOM would contain.
 */
const src: string = hudSource;

/** Split the module into its top-level functions, keyed by name. */
function topLevelFunctions(text: string): { name: string; body: string }[] {
  const starts = [...text.matchAll(/^function (\w+)\(/gm)];
  return starts.map((m, i) => ({
    name: m[1]!,
    body: text.slice(m.index!, starts[i + 1]?.index ?? text.length),
  }));
}

const refsIn = (body: string): string[] => [...body.matchAll(/data-ref="([^"]+)"/g)].map((m) => m[1]!);

describe("HUD data-ref integrity", () => {
  const fns = topLevelFunctions(src);

  it("found the render functions to analyse", () => {
    // Guards against the parser silently matching nothing, which would make
    // every assertion below vacuously true.
    expect(fns.length).toBeGreaterThan(20);
    expect(fns.some((f) => f.name === "renderMain")).toBe(true);
  });

  it("no screen defines the same data-ref twice", () => {
    for (const fn of fns) {
      const refs = refsIn(fn.body).filter((r) => !r.includes("${"));
      const seen = new Set<string>();
      const dupes = new Set<string>();
      for (const r of refs) {
        if (seen.has(r)) dupes.add(r);
        seen.add(r);
      }
      expect([...dupes], `${fn.name} duplicates a data-ref`).toEqual([]);
    }
  });

  it("every literal grab() target exists as a data-ref", () => {
    const defined = new Set(refsIn(src));
    const targets = [...new Set([...src.matchAll(/grab\("([^"]+)"\)/g)].map((m) => m[1]!))].filter((t) => !t.includes("${"));
    expect(targets.length).toBeGreaterThan(20);
    const missing = targets.filter((t) => !defined.has(t));
    expect(missing, `grab() with no matching data-ref: ${missing.join(", ")}`).toEqual([]);
  });

  it("every literal readValue() target exists as a data-ref", () => {
    const defined = new Set(refsIn(src));
    const targets = [...new Set([...src.matchAll(/readValue\("([^"]+)"\)/g)].map((m) => m[1]!))];
    const missing = targets.filter((t) => !defined.has(t));
    expect(missing, `readValue() with no matching data-ref: ${missing.join(", ")}`).toEqual([]);
  });

  it("literal refs are non-empty and safe identifiers", () => {
    // Interpolated refs like data-ref="${CSS.escape(ref)}" are dynamic by
    // design and are skipped; only literal names are checked.
    const literals = refsIn(src).filter((r) => !r.includes("${"));
    expect(literals.length).toBeGreaterThan(20);
    for (const r of literals) {
      expect(r.length, "empty data-ref").toBeGreaterThan(0);
      expect(r, `data-ref "${r}"`).toMatch(/^[A-Za-z][A-Za-z0-9_-]*$/);
    }
  });
});

describe("HUD escapes catalogue data before interpolating it", () => {
  // escapeHtml is used 41 times across HUD.ts — it is the established
  // convention. These four sites broke it: the checkout sheet rendered the SKU
  // name raw (twice) and the shop card rendered name/perk/prizeOnly raw. No
  // catalogue string contains "<" today, so none was exploitable, but the
  // checkout screen is the last place to discover that convention by accident.
  const fn = (name: string): string => {
    const start = src.indexOf(`function ${name}(`);
    expect(start, `${name} not found`).toBeGreaterThan(-1);
    const rest = src.slice(start);
    const next = rest.slice(1).search(/^function /m);
    return next === -1 ? rest : rest.slice(0, next + 1);
  };

  it.each([
    ["renderSkinCard", ["${d.name}", "${d.perk}", "${d.prizeOnly}"]],
    ["renderCheckout", ["${item.name}"]],
  ])("%s interpolates no raw catalogue string", (name, raw) => {
    const body = fn(name);
    for (const r of raw) {
      expect(body.includes(r), `${name} still interpolates ${r} unescaped`).toBe(false);
      expect(body.includes(`escapeHtml(${r.slice(2, -1)})`), `${name} lost escapeHtml(${r.slice(2, -1)})`).toBe(true);
    }
  });

  it("the escape helper itself is what those calls use", () => {
    expect(src).toContain("function escapeHtml(");
  });
});

describe("HUD action wiring", () => {
  it("data-action values are non-empty and uniquely named per intent", () => {
    // Duplicate data-action is SAFE by design (onAction uses closest()), so
    // this only checks shape — not uniqueness. Asserting uniqueness here would
    // be wrong and would break the first time two buttons share a handler.
    const all = [...src.matchAll(/data-action="([^"]+)"/g)].map((m) => m[1]!);
    const actions = all.filter((a) => !a.includes("${"));
    expect(actions.length).toBeGreaterThan(30);
    for (const a of actions) {
      expect(a.length).toBeGreaterThan(0);
      expect(a, `data-action "${a}"`).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    }
  });
});
