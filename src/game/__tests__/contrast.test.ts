import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Read with fs, not Vite's ?raw: `?raw` works for .ts but returns an EMPTY
// string for .css, because Vite still treats it as a stylesheet. And
// `readFileSync(new URL(...))` throws "The URL must be of scheme file" under
// the jsdom environment — jsdom replaces the global URL class, so node's
// internal scheme check rejects its instance. fileURLToPath takes the string
// form and sidesteps that entirely.
const here = dirname(fileURLToPath(import.meta.url));
const uiCss = readFileSync(resolve(here, "../ui.css"), "utf8");
const indexCss = readFileSync(resolve(here, "../../index.css"), "utf8");

/**
 * Text contrast. Low contrast is the single most common reason an interface
 * reads as cheap, and it regresses silently — someone nudges a brand colour
 * half a step and no test notices.
 *
 * Scope, deliberately narrow: only rules that declare BOTH an opaque `color`
 * and an opaque `background` in the same block. Anything else cannot be judged
 * from source — the effective background may come from a parent, a gradient, or
 * a translucent overlay — and guessing it produces false positives. An earlier
 * pass that defaulted missing backgrounds to the paper colour reported 155
 * "failures", almost all of them wrong (`.vip-chip { color:#fff }` gets its
 * background from a gradient declared elsewhere).
 */
const css = uiCss + "\n" + indexCss;

type RGB = [number, number, number];

function parseColor(raw: string): RGB | null {
  const c = raw.trim();
  if (c.startsWith("#")) {
    let h = c.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join("");
    if (h.length < 6) return null;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (parts.length >= 4 && parts[3]! < 0.9) return null; // translucent: real bg unknown
    return parts.slice(0, 3) as RGB;
  }
  return null;
}

function luminance([r, g, b]: RGB): number {
  const f = (v: number) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: RGB, b: RGB): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

interface Finding {
  selector: string;
  ratio: number;
  need: number;
}

function audit(): { checked: number; failures: Finding[] } {
  const failures: Finding[] = [];
  let checked = 0;
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1]!.trim().split("\n").pop()!.trim();
    const body = m[2]!;
    const cm = body.match(/(?:^|[;{])\s*color:\s*([^;]+)/);
    const bm = body.match(/background(?:-color)?:\s*([^;]+)/);
    if (!cm || !bm) continue;
    if (/gradient/.test(bm[1]!)) continue; // gradient: sample point unknown
    const fg = parseColor(cm[1]!);
    const bg = parseColor(bm[1]!);
    if (!fg || !bg) continue;
    checked++;
    // WCAG 1.4.3: 4.5:1 for normal text, 3:1 for large (>=24px) or bold text.
    const bold = /font-weight:\s*(?:[6-9]00|bold)/.test(body);
    const sizeMatch = body.match(/font-size:\s*(\d+)/);
    const large = sizeMatch !== null && Number(sizeMatch[1]) >= 24;
    const need = bold || large ? 3 : 4.5;
    const ratio = contrast(fg, bg);
    if (ratio < need) failures.push({ selector, ratio: +ratio.toFixed(2), need });
  }
  return { checked, failures };
}

describe("UI text contrast (WCAG 1.4.3)", () => {
  const { checked, failures } = audit();

  it("actually inspects a meaningful number of rules", () => {
    // Guards against the parser silently matching nothing, which would make
    // the pass below vacuous.
    expect(checked).toBeGreaterThan(30);
  });

  it("every rule with a known foreground and background meets its threshold", () => {
    const detail = failures
      .sort((a, b) => a.ratio - b.ratio)
      .map((f) => `${f.selector} ${f.ratio}:1 (need ${f.need}:1)`)
      .join("; ");
    expect(failures, detail).toEqual([]);
  });
});
