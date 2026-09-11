// POST /api/score
//
// Implements the `POST /score` half of LEADERBOARD_API.md: accepts a finished
// run, keeps the best row per pilot (best by distance), and enforces the
// documented plausibility gates + optional HMAC signing (v1.1).
import { createHmac, timingSafeEqual } from "node:crypto";
import { getRow, putRow } from "./_lib/store";
import { boundedNum, handleOptions, json, sanitize, todayStr } from "./_lib/http";

export const config = { runtime: "nodejs" };

const SALT = process.env.LEADERBOARD_SALT ?? "";

function sign(deviceId: string, distance: number, score: number): string {
  return createHmac("sha256", SALT)
    .update(`${deviceId}|${distance}|${score}`)
    .digest("hex");
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const p = (body ?? {}) as Record<string, unknown>;

  const row = {
    deviceId: sanitize(p.deviceId, 64),
    name: sanitize(p.name, 14) || "Pilot",
    skin: sanitize(p.skin, 24),
    distance: Math.round(boundedNum(p.distance, 500_000)),
    altitude: Math.round(boundedNum(p.altitude, 10_000)),
    perfects: Math.round(boundedNum(p.perfects, 5_000)),
    coins: Math.round(boundedNum(p.coins, 100_000)),
    score: Math.round(boundedNum(p.score, 5_000_000)),
    date: todayStr(),
  };

  if (!row.deviceId) return json({ error: "missing deviceId" }, 400);

  // Plausibility gates (documented in LEADERBOARD_API.md), enforced whether
  // or not signing is configured.
  if (row.distance > 60_000) return json({ error: "implausible distance" }, 422);
  if (row.score > row.distance * 40 + 50_000) return json({ error: "implausible score" }, 422);

  // Signing (v1.1): when LEADERBOARD_SALT is set, an unsigned/badly-signed
  // post is rejected.
  if (SALT) {
    const provided = sanitize(p.sig, 128);
    const expected = sign(row.deviceId, row.distance, row.score);
    // Compare length first (a fixed 64-hex digest), then constant-time bytes.
    const providedBuf = Buffer.from(provided);
    const expectedBuf = Buffer.from(expected);
    const same =
      providedBuf.length === expectedBuf.length &&
      timingSafeEqual(providedBuf, expectedBuf);
    if (!same) return json({ error: "invalid signature" }, 403);
  }

  // Keep the best row per pilot (best by distance), matching the reference.
  const prev = await getRow(row.deviceId);
  if (!prev || row.distance > prev.distance) await putRow(row);

  return json({ ok: true });
}
