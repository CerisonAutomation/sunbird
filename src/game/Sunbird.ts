/**
 * Sunbird — the one canonical bird shape, used everywhere the game draws a bird.
 *
 * This module exists because the main menu drew a real sunbird (orange body,
 * cream belly, gold beak, banked wings) while the race lobby, the VS screen and
 * the roster bar drew three CSS ellipses and called it a bird. Same game, two
 * different animals. Now there is one definition and two renderers over it:
 *
 *   - `drawSunbird()`  — Canvas2D, for the animated menu sky and flock.
 *   - `sunbirdSVG()`   — inline SVG with *identical* geometry, so DOM UI can
 *                        show the same bird at any size without a canvas.
 *
 * Geometry lives once in `SUNBIRD_SHAPE`, in units where the bird's `size` is
 * 100 and it faces +x, centred on the origin. Both renderers walk that table,
 * so the canvas bird and the SVG bird cannot drift apart.
 */

export type SunbirdPalette = {
  body: string;
  belly: string;
  wingNear: string;
  wingFar: string;
  beak: string;
  eye: string;
};

/** The hero sunbird from the main menu. This is the reference colourway. */
export const SUNBIRD_PALETTE: SunbirdPalette = {
  body: "#ff7a45",
  belly: "#ffe6c4",
  wingNear: "#ff9a62",
  wingFar: "#e06a35",
  beak: "#ffb020",
  eye: "#2a1c28",
};

/**
 * Rival colourways. Same silhouette, different plumage — so a lobby full of
 * rivals reads as a flock of sunbirds rather than a row of blue blobs, and you
 * can still tell yourself apart at a glance.
 */
export const RIVAL_PALETTES: readonly SunbirdPalette[] = [
  { body: "#5eb7ea", belly: "#eaf6ff", wingNear: "#83cbf2", wingFar: "#3d8fc4", beak: "#ffc24d", eye: "#1d2b38" },
  { body: "#7ad6a8", belly: "#e8fff4", wingNear: "#9fe6c4", wingFar: "#4fae82", beak: "#ffd166", eye: "#1c3227" },
  { body: "#c39bf0", belly: "#f4ecff", wingNear: "#d8bcf7", wingFar: "#9a72cc", beak: "#ffbe5c", eye: "#2a1f3d" },
  { body: "#f0a0b8", belly: "#fff0f4", wingNear: "#f7bccd", wingFar: "#cc7894", beak: "#ffc76b", eye: "#3a1f2a" },
  { body: "#ffd166", belly: "#fff8e0", wingNear: "#ffe09a", wingFar: "#d9a93f", beak: "#ff9f45", eye: "#3a2c10" },
  { body: "#8a9bb0", belly: "#e8eef4", wingNear: "#a8b8c8", wingFar: "#68788c", beak: "#c8b48a", eye: "#232a33" },
];

export function rivalPalette(index: number): SunbirdPalette {
  const list = RIVAL_PALETTES;
  return list[((index % list.length) + list.length) % list.length]!;
}

/**
 * One ellipse or polygon in bird units (size = 100, facing +x, origin at the
 * body centre). Both renderers walk this table in order, back to front.
 */
type Ellipse = {
  kind: "ellipse";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** radians, clockwise — matches Canvas2D and SVG (both are y-down). */
  rot: number;
  /** how the centre and angle shift with the flap phase, in bird units. */
  flapY: number;
  flapRot: number;
  color: keyof SunbirdPalette;
  /** multiplies the colour channel, matching the menu's far-wing darkening. */
  shade: number;
};

type Polygon = {
  kind: "polygon";
  points: readonly (readonly [number, number])[];
  color: keyof SunbirdPalette;
  shade: number;
};

type Part = Ellipse | Polygon;

const SUNBIRD_SHAPE: readonly Part[] = [
  // Far wing, behind the body.
  { kind: "ellipse", cx: -5, cy: -16, rx: 50, ry: 20, rot: -0.5, flapY: -34, flapRot: -0.35, color: "wingFar", shade: 0.92 },
  // Body.
  { kind: "ellipse", cx: 0, cy: 0, rx: 62, ry: 40, rot: 0.06, flapY: 0, flapRot: 0, color: "body", shade: 1 },
  // Belly.
  { kind: "ellipse", cx: 10, cy: 14, rx: 36, ry: 20, rot: 0.1, flapY: 0, flapRot: 0, color: "belly", shade: 1 },
  // Tail feathers.
  { kind: "polygon", points: [[-50, 0], [-95, -18], [-85, 12]], color: "wingFar", shade: 1 },
  // Near wing, banks with the flap.
  { kind: "ellipse", cx: 2, cy: -5, rx: 56, ry: 24, rot: -0.35, flapY: -42, flapRot: -0.5, color: "wingNear", shade: 1 },
  // Beak.
  { kind: "polygon", points: [[58, -6], [86, 2], [56, 12]], color: "beak", shade: 1 },
];

/** Eye geometry, drawn only when the bird is big enough to read. */
const EYE = { cx: 36, cy: -10, r: 7, hx: 38.5, hy: -12.5, hr: 2.5 } as const;

/** Tight viewBox around the shape, in bird units. */
export const SUNBIRD_VIEWBOX = "-98 -74 190 112";

const DEG = 180 / Math.PI;

/** Apply the depth dimming the menu uses: fades toward a deep silhouette. */
export function dimColor(hex: string, dim: number, shade = 1): string {
  const f = Math.max(0.35, Math.min(1, dim));
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f * shade);
  const g = Math.round(((n >> 8) & 255) * f * shade);
  const b = Math.round((n & 255) * f * shade);
  return `rgb(${r},${g},${b})`;
}

function partColor(part: Part, palette: SunbirdPalette, dim: number): string {
  return dimColor(palette[part.color], dim, part.shade);
}

/**
 * Draw the sunbird on a Canvas2D context, centred on the origin and facing +x.
 * `flap` is 0..1 through the wingbeat; `dim` fades 1 (near, full colour) toward
 * a deeper silhouette for distant birds.
 */
export function drawSunbird(
  ctx: CanvasRenderingContext2D,
  size: number,
  flap: number,
  dim = 1,
  palette: SunbirdPalette = SUNBIRD_PALETTE,
): void {
  const s = size / 100;
  for (const part of SUNBIRD_SHAPE) {
    ctx.fillStyle = partColor(part, palette, dim);
    ctx.beginPath();
    if (part.kind === "ellipse") {
      ctx.ellipse(
        part.cx * s,
        (part.cy + part.flapY * flap) * s,
        part.rx * s,
        part.ry * s,
        part.rot + part.flapRot * flap,
        0,
        Math.PI * 2,
      );
    } else {
      const [first, ...rest] = part.points;
      ctx.moveTo(first![0] * s, first![1] * s);
      for (const p of rest) ctx.lineTo(p[0] * s, p[1] * s);
      ctx.closePath();
    }
    ctx.fill();
  }

  // The eye only earns its pixels once the bird is large enough to read.
  if (size >= 14) {
    ctx.fillStyle = dimColor(palette.eye, dim);
    ctx.beginPath();
    ctx.arc(EYE.cx * s, EYE.cy * s, EYE.r * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = dimColor("#ffffff", dim);
    ctx.beginPath();
    ctx.arc(EYE.hx * s, EYE.hy * s, EYE.hr * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

export type SunbirdSvgOptions = {
  palette?: SunbirdPalette;
  /** 0..1 through the wingbeat. Defaults to a mid-flap pose. */
  flap?: number;
  /** Rendered width in px; height follows the shape's aspect ratio. */
  width?: number;
  title?: string;
  /** Extra classes on the root <svg>. */
  className?: string;
};

/**
 * The same bird as inline SVG, so DOM UI (lobby cards, VS screen, roster pips)
 * shows the real sunbird instead of a CSS approximation. Returns markup that is
 * safe to interpolate: every colour comes from the fixed palette tables and the
 * only free text goes through `escapeText`.
 */
export function sunbirdSVG(opts: SunbirdSvgOptions = {}): string {
  const palette = opts.palette ?? SUNBIRD_PALETTE;
  const flap = opts.flap ?? 0.4;
  const width = opts.width ?? 72;
  const dim = 1;

  const parts = SUNBIRD_SHAPE.map((part) => {
    const fill = partColor(part, palette, dim);
    if (part.kind === "ellipse") {
      const cy = round(part.cy + part.flapY * flap);
      const rot = round((part.rot + part.flapRot * flap) * DEG);
      return `<ellipse cx="${part.cx}" cy="${cy}" rx="${part.rx}" ry="${part.ry}" fill="${fill}" transform="rotate(${rot} ${part.cx} ${cy})"/>`;
    }
    const pts = part.points.map((p) => `${p[0]},${p[1]}`).join(" ");
    return `<polygon points="${pts}" fill="${fill}"/>`;
  }).join("");

  // Both eye colours go through dimColor exactly as the canvas renderer does,
  // so the two renderers emit byte-identical fills and cannot drift apart.
  const eye =
    `<circle cx="${EYE.cx}" cy="${EYE.cy}" r="${EYE.r}" fill="${dimColor(palette.eye, dim)}"/>` +
    `<circle cx="${EYE.hx}" cy="${EYE.hy}" r="${EYE.hr}" fill="${dimColor("#ffffff", dim)}"/>`;

  const title = opts.title ? `<title>${escapeText(opts.title)}</title>` : "";
  const role = opts.title ? 'role="img"' : 'aria-hidden="true"';
  const cls = opts.className ? ` class="${escapeText(opts.className)}"` : "";
  const height = Math.round((width * 112) / 190);

  return (
    `<svg${cls} ${role} viewBox="${SUNBIRD_VIEWBOX}" width="${width}" height="${height}" ` +
    `xmlns="http://www.w3.org/2000/svg" focusable="false">${title}${parts}${eye}</svg>`
  );
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function escapeText(value: string): string {
  return value.replace(/[<>&"']/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === '"' ? "&quot;" : "&#39;",
  );
}
