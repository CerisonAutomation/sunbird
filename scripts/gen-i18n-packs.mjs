#!/usr/bin/env node
/**
 * Generate per-locale runtime packs from the barrel.
 *
 * The barrel (`src/i18n/translations.barrel.json`) is the single source of
 * truth: one entry per key carrying `sourceText` + `translations` for every
 * shipped locale. That shape is ideal for reviewers and coverage tooling, but
 * statically importing it puts ALL locales into the boot bundle (~94 KB).
 *
 * This script projects the barrel into flat per-locale packs
 * (`src/i18n/packs/<locale>.json` — `{ key: text }`), which the runtime
 * lazy-loads one locale at a time. English is generated too: it is the eager
 * fallback pack and the only one imported statically.
 *
 * Regenerate after editing the barrel:
 *
 *     node scripts/gen-i18n-packs.mjs
 *
 * `src/i18n/__tests__/locales.test.ts` re-derives the packs in memory and
 * fails on drift, so a barrel edit without regeneration cannot ship.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const barrelPath = join(root, "src/i18n/translations.barrel.json");
const outDir = join(root, "src/i18n/packs");

const barrel = JSON.parse(readFileSync(barrelPath, "utf8"));
// Locale codes come from the entries themselves (the union of every
// entry's `translations` keys) — NOT from the barrel's top-level per-file
// mirror keys, which is a partial listing and has missed tr/ru before.
const codes = [...new Set(Object.values(barrel.barrel).flatMap((e) => Object.keys(e.translations ?? {})))].sort();

mkdirSync(outDir, { recursive: true });

let written = 0;
for (const code of codes) {
  const pack = {};
  for (const [key, entry] of Object.entries(barrel.barrel)) {
    const text = entry.translations[code] ?? entry.translations.en ?? entry.sourceText;
    if (typeof text === "string" && text.length > 0) pack[key] = text;
  }
  const ordered = Object.fromEntries(Object.entries(pack).sort(([a], [b]) => (a < b ? -1 : 1)));
  const file = join(outDir, `${code}.json`);
  writeFileSync(file, JSON.stringify(ordered, null, 1) + "\n");
  written += 1;
  console.log(`  packs/${code}.json — ${Object.keys(ordered).length} keys`);
}

console.log(`i18n packs regenerated: ${written} locales from ${Object.keys(barrel.barrel).length} barrel keys`);
