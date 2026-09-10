/**
 * Procedurally renders the app icons (no external assets, no AI images):
 *   public/icons/icon-192.png, icon-512.png, apple-touch-icon.png
 * Run: node scripts/gen-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

const SS = 4; // supersample factor for antialiasing

/** Sky -> sunset gradient, sun disc, layered hills, and the sunbird. */
function paint(size) {
  const S = size * SS;
  const px = new Uint8ClampedArray(S * S * 4);
  const set = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = 255;
  };
  const disc = (cx, cy, rx, ry, col, rot = 0) => {
    const c = Math.cos(-rot);
    const s = Math.sin(-rot);
    const x0 = Math.floor(cx - Math.hypot(rx, ry) - 2);
    const x1 = Math.ceil(cx + Math.hypot(rx, ry) + 2);
    for (let y = Math.floor(cy - Math.hypot(rx, ry) - 2); y <= x1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const u = dx * c - dy * s;
        const v = dx * s + dy * c;
        if ((u * u) / (rx * rx) + (v * v) / (ry * ry) <= 1) set(Math.round(x), Math.round(y), col[0], col[1], col[2]);
      }
    }
  };

  const skyTop = [94, 192, 240];
  const skyMid = [168, 226, 250];
  const skyLow = [255, 206, 138];
  for (let y = 0; y < S; y++) {
    const t = y / S;
    const a = t < 0.6 ? mix(skyTop, skyMid, t / 0.6) : mix(skyMid, skyLow, (t - 0.6) / 0.4);
    for (let x = 0; x < S; x++) set(x, y, a[0], a[1], a[2]);
  }

  // sun + halo
  disc(S * 0.72, S * 0.3, S * 0.2, S * 0.2, [255, 246, 200]);
  ring(S, S * 0.72, S * 0.3, S * 0.235, S * 0.02, [255, 252, 226, 120], px, S);

  // hills (two sine layers)
  for (let x = 0; x < S; x++) {
    const u = x / S;
    const h1 = S * (0.66 + Math.sin(u * 6.1 + 0.4) * 0.055 - Math.cos(u * 3.1) * 0.03);
    const h2 = S * (0.79 + Math.sin(u * 4.4 + 2.2) * 0.045);
    for (let y = 0; y < S; y++) {
      if (y >= h1) set(x, y, 74, 168, 96);
      if (y >= h2) set(x, y, 40, 116, 84);
    }
  }

  // bird
  const bx = S * 0.4;
  const by = S * 0.5;
  disc(bx, by, S * 0.155, S * 0.12, [255, 122, 69], -0.18);
  disc(bx + S * 0.03, by + S * 0.05, S * 0.09, S * 0.055, [255, 232, 196], -0.12);
  disc(bx - S * 0.045, by - S * 0.02, S * 0.085, S * 0.038, [255, 168, 110], -0.55);
  disc(bx + S * 0.145, by - S * 0.01, S * 0.05, S * 0.022, [255, 200, 76], -0.1);
  disc(bx + S * 0.09, by - S * 0.05, S * 0.028, S * 0.028, [255, 252, 248]);
  disc(bx + S * 0.1, by - S * 0.05, S * 0.013, S * 0.013, [40, 26, 40]);

  // downsample
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let j = 0; j < SS; j++) {
        for (let i = 0; i < SS; i++) {
          const k = ((y * SS + j) * S + (x * SS + i)) * 4;
          r += px[k];
          g += px[k + 1];
          b += px[k + 2];
        }
      }
      const n = SS * SS;
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = 255;
    }
  }
  return out;
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function ring(S, cx, cy, r, w, col, px, _s) {
  for (let y = Math.floor(cy - r - w); y <= cy + r + w; y++) {
    for (let x = Math.floor(cx - r - w); x <= cx + r + w; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (Math.abs(d - r) <= w) {
        const i = (y * S + x) * 4;
        const a = col[3] / 255;
        px[i] = px[i] * (1 - a) + col[0] * a;
        px[i + 1] = px[i + 1] * (1 - a) + col[1] * a;
        px[i + 2] = px[i + 2] * (1 - a) + col[2] * a;
      }
    }
  }
}

/* ---------- PNG encoding ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, y * size * 4 * rgba.BYTES_PER_ELEMENT, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
  ["favicon-32.png", 32],
  ["favicon-64.png", 64],
]) {
  const buf = encodePng(size, paint(size));
  writeFileSync(join(outDir, name), buf);
  console.log(`${name}: ${size}x${size} · ${(buf.length / 1024).toFixed(1)} KB`);
}
