import { describe, expect, it } from "vitest";
import {
  RIVAL_PALETTES,
  SUNBIRD_PALETTE,
  SUNBIRD_VIEWBOX,
  dimColor,
  drawSunbird,
  rivalPalette,
  sunbirdSVG,
  type SunbirdPalette,
} from "../Sunbird";

/**
 * The whole point of Sunbird.ts is that the menu bird and the UI bird are the
 * same shape. These tests pin that: the canvas renderer and the SVG renderer
 * must agree on geometry, and the shared palette must stay the menu's.
 */

/** A recording Canvas2D stand-in — captures every geometry call. */
function recordingCtx() {
  const calls: { kind: string; args: number[] }[] = [];
  const fills: string[] = [];
  const ctx = {
    fillStyle: "" as string,
    beginPath: () => calls.push({ kind: "beginPath", args: [] }),
    closePath: () => calls.push({ kind: "closePath", args: [] }),
    fill: () => {
      calls.push({ kind: "fill", args: [] });
      fills.push(String(ctx.fillStyle));
    },
    ellipse: (...a: number[]) => calls.push({ kind: "ellipse", args: a }),
    arc: (...a: number[]) => calls.push({ kind: "arc", args: a }),
    moveTo: (...a: number[]) => calls.push({ kind: "moveTo", args: a }),
    lineTo: (...a: number[]) => calls.push({ kind: "lineTo", args: a }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, fills };
}

describe("Sunbird palettes", () => {
  it("keeps the main-menu hero colourway as the reference", () => {
    // If this changes, the lobby bird stops matching the menu bird.
    expect(SUNBIRD_PALETTE).toEqual({
      body: "#ff7a45",
      belly: "#ffe6c4",
      wingNear: "#ff9a62",
      wingFar: "#e06a35",
      beak: "#ffb020",
      eye: "#2a1c28",
    });
  });

  it("gives every rival the same six slots, so the silhouette never changes", () => {
    const slots = Object.keys(SUNBIRD_PALETTE).sort();
    for (const p of RIVAL_PALETTES) {
      expect(Object.keys(p).sort()).toEqual(slots);
      for (const value of Object.values(p)) expect(value).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("wraps the rival index both ways without going out of range", () => {
    const n = RIVAL_PALETTES.length;
    expect(rivalPalette(0)).toBe(RIVAL_PALETTES[0]);
    expect(rivalPalette(n)).toBe(RIVAL_PALETTES[0]);
    expect(rivalPalette(n + 3)).toBe(RIVAL_PALETTES[3]);
    expect(rivalPalette(-1)).toBe(RIVAL_PALETTES[n - 1]);
  });
});

describe("drawSunbird (canvas)", () => {
  it("draws the full bird — wings, body, belly, tail, beak, eye", () => {
    const { ctx, calls } = recordingCtx();
    drawSunbird(ctx, 40, 0.5, 1);
    const ellipses = calls.filter((c) => c.kind === "ellipse");
    const polygons = calls.filter((c) => c.kind === "moveTo");
    // 4 ellipses (far wing, body, belly, near wing) + 2 polygons (tail, beak).
    expect(ellipses).toHaveLength(4);
    expect(polygons).toHaveLength(2);
    // Eye + highlight.
    expect(calls.filter((c) => c.kind === "arc")).toHaveLength(2);
  });

  it("drops the eye below 14px so distant birds stay clean", () => {
    const small = recordingCtx();
    drawSunbird(small.ctx, 13, 0.5, 1);
    expect(small.calls.filter((c) => c.kind === "arc")).toHaveLength(0);

    const big = recordingCtx();
    drawSunbird(big.ctx, 14, 0.5, 1);
    expect(big.calls.filter((c) => c.kind === "arc")).toHaveLength(2);
  });

  it("scales every coordinate with size", () => {
    const a = recordingCtx();
    const b = recordingCtx();
    drawSunbird(a.ctx, 20, 0, 1);
    drawSunbird(b.ctx, 40, 0, 1);
    const bodyA = a.calls.find((c) => c.kind === "ellipse")!;
    const bodyB = b.calls.find((c) => c.kind === "ellipse")!;
    // Radii are args 2 and 3 of ctx.ellipse.
    expect(bodyB.args[2]).toBeCloseTo(bodyA.args[2]! * 2, 6);
    expect(bodyB.args[3]).toBeCloseTo(bodyA.args[3]! * 2, 6);
  });

  it("banks the wings with the flap phase", () => {
    const down = recordingCtx();
    const up = recordingCtx();
    drawSunbird(down.ctx, 40, 0, 1);
    drawSunbird(up.ctx, 40, 1, 1);
    // First ellipse is the far wing: cy (arg 1) and rotation (arg 4) both move.
    const farDown = down.calls.find((c) => c.kind === "ellipse")!;
    const farUp = up.calls.find((c) => c.kind === "ellipse")!;
    expect(farUp.args[1]).toBeLessThan(farDown.args[1]!);
    expect(farUp.args[4]).toBeLessThan(farDown.args[4]!);
  });

  it("dims distant birds but never below the silhouette floor", () => {
    const full = recordingCtx();
    const faint = recordingCtx();
    drawSunbird(full.ctx, 40, 0.5, 1);
    drawSunbird(faint.ctx, 40, 0.5, 0.1);
    expect(full.fills[0]).toBe(dimColor("#e06a35", 1, 0.92));
    expect(faint.fills[0]).toBe(dimColor("#e06a35", 0.1, 0.92));
    // dim is floored at 0.35 so far birds never vanish entirely.
    expect(dimColor("#ff7a45", 0.01)).toBe(dimColor("#ff7a45", 0.35));
  });

  it("accepts a rival palette without changing the geometry", () => {
    const hero = recordingCtx();
    const rival = recordingCtx();
    drawSunbird(hero.ctx, 40, 0.5, 1);
    drawSunbird(rival.ctx, 40, 0.5, 1, RIVAL_PALETTES[0]!);
    expect(hero.calls).toEqual(rival.calls);
    expect(hero.fills).not.toEqual(rival.fills);
  });
});

describe("sunbirdSVG (DOM)", () => {
  it("emits the same part count as the canvas renderer", () => {
    const svg = sunbirdSVG();
    expect((svg.match(/<ellipse/g) ?? [])).toHaveLength(4);
    expect((svg.match(/<polygon/g) ?? [])).toHaveLength(2);
    expect((svg.match(/<circle/g) ?? [])).toHaveLength(2);
  });

  it("carries the hero palette through to the markup", () => {
    const svg = sunbirdSVG();
    // Body colour, after dimColor(…, 1) turns the hex into rgb().
    expect(svg).toContain(dimColor(SUNBIRD_PALETTE.body, 1));
    expect(svg).toContain(dimColor(SUNBIRD_PALETTE.beak, 1));
    expect(svg).toContain(`viewBox="${SUNBIRD_VIEWBOX}"`);
  });

  it("matches the canvas fill order exactly — same bird, two renderers", () => {
    const palette: SunbirdPalette = RIVAL_PALETTES[2]!;
    const { ctx, fills } = recordingCtx();
    const flap = 0.4; // sunbirdSVG's default
    drawSunbird(ctx, 100, flap, 1, palette);

    const svgFills = [...sunbirdSVG({ palette, flap }).matchAll(/fill="([^"]+)"/g)].map((m) => m[1]);
    // The canvas list ends with the eye + its white highlight; the SVG does too.
    expect(svgFills.slice(0, fills.length)).toEqual(fills);
  });

  it("rotates the wings in the SVG the same way the canvas does", () => {
    const svg = sunbirdSVG({ flap: 1 });
    const rots = [...svg.matchAll(/rotate\(([-\d.]+)/g)].map((m) => Number(m[1]));
    // Far wing: (-0.5 - 0.35 * flap) rad -> degrees, negative = banked up.
    const { ctx, calls } = recordingCtx();
    drawSunbird(ctx, 100, 1, 1);
    const canvasRad = calls.find((c) => c.kind === "ellipse")!.args[4]!;
    expect(rots[0]).toBeCloseTo((canvasRad * 180) / Math.PI, 1);
  });

  it("sizes from width and keeps the shape's aspect ratio", () => {
    const svg = sunbirdSVG({ width: 190 });
    expect(svg).toContain('width="190"');
    expect(svg).toContain('height="112"');
  });

  it("escapes free text so a rival name cannot inject markup", () => {
    const svg = sunbirdSVG({ title: `<img src=x onerror="alert(1)">` });
    expect(svg).not.toContain("<img");
    expect(svg).toContain("&lt;img");
    expect(svg).toContain("<title>");
  });

  it("is decorative by default and only labelled when titled", () => {
    expect(sunbirdSVG()).toContain('aria-hidden="true"');
    expect(sunbirdSVG({ title: "Nimbus" })).toContain('role="img"');
    expect(sunbirdSVG({ title: "Nimbus" })).toContain("<title>Nimbus</title>");
  });

  it("produces no undefined or NaN in the output", () => {
    for (const flap of [0, 0.25, 0.5, 1]) {
      for (const p of [SUNBIRD_PALETTE, ...RIVAL_PALETTES]) {
        const svg = sunbirdSVG({ palette: p, flap, width: 64 });
        expect(svg).not.toMatch(/undefined|NaN/);
      }
    }
  });
});
