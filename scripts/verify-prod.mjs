#!/usr/bin/env node
/**
 * "Autoperfect production mode" — one command that enforces the production
 * bar, not just the build bar. Runs the full gate (lint → typecheck → tests →
 * build), then a production-readiness audit:
 *
 *   1. Debug artifacts  — shipped client code must carry no `console.log` /
 *      `console.warn` / `console.info`, `debugger`, TODO/FIXME, `@ts-ignore`,
 *      or `eslint-disable`. (Observability `console.error` and the gated
 *      telemetry `console.debug` are allowed.)
 *   2. Determinism      — enforced by the deterministic-sim suite in `npm test`
 *      (same seed ⇒ bit-identical physics, terrain and sunflower pads). A
 *      non-deterministic change can never pass the gate silently.
 *   3. Performance budget — total JS and largest single bundle must stay under
 *      a hard cap, so a stray import can't bloat the shipped payload unnoticed.
 *
 * Exit 0 = production ready. Exit 1 = a concrete, actionable failure list.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const SRC = join(root, "src");
const DIST = join(root, "dist");

// Hard budgets (bytes, raw). Tune deliberately; raise only with a reason.
const MAX_TOTAL_JS = 2_500_000; // 2.5 MB
const MAX_LARGEST_JS = 1_500_000; // 1.5 MB

const BANNED = [
  { re: /\bconsole\.(log|warn|info)\s*\(/, label: "console.log/warn/info" },
  { re: /\bdebugger\b/, label: "debugger statement" },
  { re: /\bTODO\b|\bFIXME\b|\bXXX\b/, label: "TODO/FIXME/XXX" },
  { re: /@ts-ignore/, label: "@ts-ignore" },
  { re: /eslint-disable/, label: "eslint-disable" },
];

function fail(msg) {
  console.error(`\n❌ PRODUCTION GATE FAILED\n${msg}\n`);
  process.exit(1);
}

/* 0. The standard gate, fail-fast. */
const run = (cmd, args) => {
  console.log(`\n▶ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd: root, stdio: "inherit" });
};

try {
  run("npm", ["run", "lint"]);
  run("npm", ["run", "typecheck"]);
  run("npm", ["run", "test"]);
  run("npm", ["run", "build:vercel"]);
} catch {
  fail("A standard gate (lint/typecheck/test/build) failed. Fix it before the audit.");
}

/* 1. Debug-artifact audit over shipped client code. */
const violations = [];
function auditDir(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      auditDir(p);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    const text = readFileSync(p, "utf8");
    const rel = relative(root, p);
    text.split("\n").forEach((line, i) => {
      for (const rule of BANNED) {
        if (rule.re.test(line)) {
          violations.push(`${rel}:${i + 1}  ${rule.label}  →  ${line.trim().slice(0, 90)}`);
        }
      }
    });
  }
}
auditDir(SRC);
if (violations.length) {
  fail(`Debug artifacts found in shipped client code:\n${violations.join("\n")}`);
}

/* 2. Performance budget. */
const jsFiles = [];
(function collect(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) collect(p);
    else if (/\.js$/.test(entry)) jsFiles.push({ p, size: st.size });
  }
})(DIST);

const totalJs = jsFiles.reduce((a, b) => a + b.size, 0);
const largest = jsFiles.reduce((a, b) => (b.size > a.size ? b : a), { size: 0 });
if (totalJs > MAX_TOTAL_JS) {
  fail(`Total JS ${(totalJs / 1e6).toFixed(2)} MB exceeds ${(MAX_TOTAL_JS / 1e6).toFixed(2)} MB budget.`);
}
if (largest.size > MAX_LARGEST_JS) {
  fail(`Largest bundle ${(largest.size / 1e6).toFixed(2)} MB exceeds ${(MAX_LARGEST_JS / 1e6).toFixed(2)} MB budget.`);
}

console.log("\n─────────────────────────────────────────────");
console.log("✅ PRODUCTION READY");
console.log(`   debug artifacts : clean`);
console.log(`   determinism     : enforced by deterministic-sim suite (npm test)`);
console.log(`   JS total        : ${(totalJs / 1e6).toFixed(2)} MB / ${(MAX_TOTAL_JS / 1e6).toFixed(2)} MB`);
console.log(`   JS largest      : ${(largest.size / 1e6).toFixed(2)} MB / ${(MAX_LARGEST_JS / 1e6).toFixed(2)} MB`);
console.log("─────────────────────────────────────────────\n");
