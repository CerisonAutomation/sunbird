#!/usr/bin/env node
/**
 * Packages a portal build (Poki / CrazyGames) into a submission-ready zip.
 *
 * Portals want a self-contained bundle: our vite-singlefile build inlines all
 * JS/CSS into index.html, so the zip is index.html + icons. No service
 * worker (portals run the game inside a cross-origin iframe where SW
 * registration is pointless-to-harmful), no manifest (not installable there).
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const portal = process.argv[2];
if (!portal || !["poki", "crazy", "generic"].includes(portal)) {
  console.error("usage: package-portal.mjs <poki|crazy|generic>");
  process.exit(1);
}
const src = `dist-${portal}`;
if (!existsSync(src)) {
  console.error(`missing ${src} — run the build first`);
  process.exit(1);
}
const stage = `dist-${portal}-zip`;
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
// Strip PWA plumbing that has no business inside a portal iframe: the
// manifest link would 404 (we don't ship it) and portals are not installable.
const html = readFileSync(path.join(src, "index.html"), "utf8")
  .replace(/^\s*<link rel="manifest"[^>]*>\n?/m, "");
writeFileSync(path.join(stage, "index.html"), html);
cpSync(path.join(src, "icons"), path.join(stage, "icons"), { recursive: true });
cpSync(path.join(src, "fonts"), path.join(stage, "fonts"), { recursive: true });
const zip = `sunbird-${portal}.zip`;
rmSync(zip, { force: true });
execSync(`cd ${stage} && zip -qr ../${zip} .`);
rmSync(stage, { recursive: true, force: true });
const dest =
  portal === "poki"
    ? "Poki Inspector upload"
    : portal === "crazy"
      ? "CrazyGames developer portal"
      : "any HTML5 portal (GameDistribution, Yandex, itch.io, Newgrounds, GameMonetize, …)";
console.log(`✓ ${zip} ready for ${dest}`);
