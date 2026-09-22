#!/usr/bin/env node
/**
 * One-command leaderboard proof: `pnpm board:check`.
 *
 * Boots the reference leaderboard server (server/sunbird-server.mjs — the
 * in-process implementation LEADERBOARD_API.md points at) on a scratch port,
 * then runs the live client suite (src/game/__tests__/board-live.test.ts):
 * the REAL `Leaderboard` class submitting and reading real HTTP, asserting
 * sorted entries, server rank/total and best-row-per-device semantics.
 *
 * Everything is thrown away afterwards: scratch port, in-memory board, no
 * persistence. Exit code is non-zero unless every layer passes.
 *
 *   node scripts/board-check.mjs            # scratch port 8796
 *   BOARD_PORT=9011 node scripts/board-check.mjs
 */
import { spawn } from "node:child_process";

const PORT = Number(process.env.BOARD_PORT || 8796);
const BASE = `http://127.0.0.1:${PORT}`;

function run(cmd, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "inherit", "inherit"],
      env: { ...process.env, ...env },
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} → exit ${code}`))));
    child.on("error", reject);
  });
}

async function waitHealthy(timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`reference server did not become healthy on ${BASE}`);
}

const server = spawn(process.execPath, ["server/sunbird-server.mjs"], {
  stdio: ["ignore", "inherit", "inherit"],
  env: { ...process.env, PORT: String(PORT) },
});

let exited = false;
server.on("exit", (code) => {
  exited = true;
  if (code !== 0 && code !== null) console.error(`reference server exited early (code ${code})`);
});

try {
  await waitHealthy();
  console.log(`\n▶ live board suite against ${BASE}\n`);
  await run("npx", ["vitest", "run", "src/game/__tests__/board-live.test.ts"], {
    VITE_LEADERBOARD_URL: BASE,
  });
  console.log("\n✔ BOARD CHECK PASSED — client, HTTP contract and reference server agree");
} catch (err) {
  console.error(`\n✖ BOARD CHECK FAILED — ${err.message}`);
  process.exitCode = 1;
} finally {
  if (!exited) server.kill("SIGTERM");
}
