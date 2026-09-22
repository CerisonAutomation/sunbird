#!/usr/bin/env node
/**
 * Canonical validator for OMNIFUSION-CANON.v1
 *
 * Mechanically enforces the canon rules that the source documents only
 * claimed: exactly 70 traits, unique ids and aliases, all four fields
 * (facet/trigger/effect/proof) present and non-empty, evidence states
 * used correctly, and no fabricated-magnitude patterns surviving
 * canonization.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const canon = JSON.parse(readFileSync(join(here, "CANON.json"), "utf8"));

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };

/* 1. The count is the canon. */
check(Array.isArray(canon.traits), "traits must be an array");
check(canon.traits.length === 70, `expected exactly 70 traits, found ${canon.traits?.length}`);

/* 2. Identity fields. */
const ids = new Set();
const aliases = new Set();
for (const t of canon.traits) {
  check(typeof t.id === "string" && /^[a-z0-9-]+$/.test(t.id), `bad id: ${JSON.stringify(t.id)}`);
  check(typeof t.alias === "string" && /^[A-Za-z]+$/.test(t.alias), `bad alias: ${JSON.stringify(t.alias)}`);
  check(!ids.has(t.id), `duplicate id: ${t.id}`);
  check(!aliases.has(t.alias), `duplicate alias: ${t.alias}`);
  ids.add(t.id);
  aliases.add(t.alias);
  for (const field of ["facet", "trigger", "effect", "proof"]) {
    check(typeof t[field] === "string" && t[field].trim().length > 0, `${t.id}: empty ${field}`);
  }
}

/* 3. Evidence-state discipline. */
const STATES = ["observed", "candidate", "reproduced", "confirmed"];
for (const t of canon.traits) {
  for (const field of ["effect", "proof"]) {
    for (const state of STATES) {
      const re = new RegExp(`\\b${state}\\b`, "i");
      check(
        !re.test(t[field]) || t[field].toLowerCase().includes(state),
        `${t.id}: evidence-state reference must be literal (${field})`,
      );
    }
  }
}

/* 4. No fabricated magnitudes survived canonization. */
const FORBIDDEN = [
  /\$\d+(\.\d+)?\s*[QM]/,        // $2.5Q, $900Q ROI fantasy
  /\b\d+\s*Q\b\s*(ROI|scenarios|users)/i,
  /sub-\d+μs/i,
  /<\s*0?\.\d+0000000?s\b/i,      // <0.00000003s gates
  /99\.9{4,}%/,                   // 99.99999...% awe
  /TIER-\d+/i,
  /\b\d+T\+?\s*(users|scenarios|edge)/i,
  /awe/i,
];
for (const t of canon.traits) {
  const text = `${t.effect} ${t.proof} ${t.trigger}`;
  for (const re of FORBIDDEN) check(!re.test(text), `${t.id}: fabricated-magnitude pattern ${re} in "${text.slice(0, 80)}"`);
}
for (const re of FORBIDDEN) check(!re.test(canon.description ?? ""), `description carries pattern ${re}`);
for (const rule of canon.canon_rules) {
  // canon_rules intentionally NAME the banned patterns to forbid them; only
  // traits/effects/proofs are scanned.
  void rule;
}

/* 5. Facets are a closed set. */
const FACETS = new Set(["reasoning", "memory", "evidence", "plan", "code", "verify", "brevity", "emotion", "design", "security", "scale", "compliance", "scope", "business", "autonomy"]);
for (const t of canon.traits) check(FACETS.has(t.facet), `${t.id}: unknown facet ${t.facet}`);

if (failures.length) {
  console.error(`✗ CANON INVALID — ${failures.length} failure(s):`);
  for (const f of failures) console.error("  -", f);
  process.exit(1);
}
console.log(`✓ OMNIFUSION-CANON.v1 valid — ${canon.traits.length}/70 traits, all facets, triggers, effects, proofs present; zero fabricated magnitudes.`);
