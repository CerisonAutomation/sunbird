// GET /api/board?scope=global|daily&metric=distance|altitude|perfects|coins&device=<id>
//
// Implements the `GET /board` half of LEADERBOARD_API.md: returns the top 50
// pilots sorted by the requested metric, plus the requesting device's rank.
import type { BoardRow } from "./_lib/store";
import { allRows } from "./_lib/store";
import { handleOptions, json, todayStr } from "./_lib/http";

export const config = { runtime: "nodejs" };

const METRICS = ["distance", "altitude", "perfects", "coins"] as const;
type Metric = (typeof METRICS)[number];

const metricOf = (row: BoardRow, metric: Metric): number => row[metric];

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return handleOptions();
  if (request.method !== "GET") return json({ error: "method not allowed" }, 405);

  const url = new URL(request.url);
  const metric: Metric = METRICS.includes(url.searchParams.get("metric") as Metric)
    ? (url.searchParams.get("metric") as Metric)
    : "distance";
  const scope = url.searchParams.get("scope") || "global";
  const device = url.searchParams.get("device") || "";

  const rows = await allRows();
  const list = scope === "daily" ? rows.filter((r) => r.date === todayStr()) : rows;
  list.sort((a, b) => metricOf(b, metric) - metricOf(a, metric));

  const rank = list.findIndex((r) => r.deviceId === device) + 1;

  return json({
    entries: list.slice(0, 50),
    rank,
    total: list.length,
  });
}
