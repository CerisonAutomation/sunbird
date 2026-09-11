#!/usr/bin/env node
/**
 * Multiplayer smoke test: two real WebSocket clients join the same public
 * Durable Object room (via the vite /mp proxy or a direct worker URL) and
 * must see each other + exchange live state frames within 4 seconds.
 *
 *   node scripts/mp-smoke.mjs [ws://localhost:5173/mp]
 */
import { WebSocket } from "ws";

const base = (process.argv[2] ?? "ws://localhost:5173/mp") + `?seed=smoke-${Date.now()}`;
const mk = (name) => new WebSocket(`${base}&device=${name}-dev&name=${name}&skin=sunbird&hue=0.5`);

const a = mk("Alice");
const b = mk("Bob");
let sawBob = false;
let liveFrames = 0;

a.on("message", (d) => {
  const m = JSON.parse(d.toString());
  if (m.type === "peers" && m.peers.some((p) => p.name === "Bob")) sawBob = true;
  if (m.type === "state" && m.pilots.length > 0) liveFrames++;
});
b.on("open", () => {
  const t = setInterval(() => b.send(JSON.stringify({ type: "state", x: Math.random() * 500, y: 30, rot: 0, d: 100 })), 100);
  b.on("close", () => clearInterval(t));
});

setTimeout(() => {
  const ok = sawBob && liveFrames >= 5;
  console.log(`peers-visible=${sawBob} live-frames=${liveFrames} → ${ok ? "PASS" : "FAIL"}`);
  a.close(); b.close();
  process.exit(ok ? 0 : 1);
}, 4000);
