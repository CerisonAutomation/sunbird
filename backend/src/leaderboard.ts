/**
 * LeaderboardDO — global leaderboard on SQLite-in-Durable-Objects.
 *
 * Free plan gives 5 GB of SQLite storage; each row here is < 200 bytes and
 * we keep exactly one row per device, so this scales to millions of pilots
 * without leaving the free tier.
 *
 * Contract (LEADERBOARD_API.md / src/game/Leaderboard.ts):
 *   GET  /board?scope=global|daily&metric=distance|altitude|perfects|coins&device=ID
 *        → { entries: BoardEntry[≤50], rank, total }
 *   POST /score  { deviceId, name, skin, distance, altitude, perfects, coins, score }
 *        → { ok: true }   (row replaced only when the new distance is higher)
 */

const METRICS = ["distance", "altitude", "perfects", "coins"] as const;
type Metric = (typeof METRICS)[number];

type Row = {
  deviceId: string;
  name: string;
  skin: string;
  distance: number;
  altitude: number;
  perfects: number;
  coins: number;
  score: number;
  date: string;
};

const clean = (v: unknown, n: number): string =>
  String(v ?? "")
    .replace(/[<>&"']/g, "")
    .slice(0, n);

const clampNum = (v: unknown, max: number): number => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n), max);
};

const todayStr = (): string => new Date().toISOString().slice(0, 10);

export class LeaderboardDO implements DurableObject {
  private readonly sql: SqlStorage;

  constructor(state: DurableObjectState, _env: unknown) {
    void _env;
    this.sql = state.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS scores (
        deviceId TEXT PRIMARY KEY,
        name     TEXT NOT NULL,
        skin     TEXT NOT NULL,
        distance INTEGER NOT NULL,
        altitude INTEGER NOT NULL,
        perfects INTEGER NOT NULL,
        coins    INTEGER NOT NULL,
        score    INTEGER NOT NULL,
        date     TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_scores_date ON scores(date);
    `);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/stats") {
      const row = this.sql.exec("SELECT COUNT(*) AS n FROM scores").one() as { n: number };
      return Response.json({ scores: row.n });
    }

    if (url.pathname === "/board") {
      const metricParam = url.searchParams.get("metric") ?? "distance";
      const metric: Metric = (METRICS as readonly string[]).includes(metricParam)
        ? (metricParam as Metric)
        : "distance";
      const scope = url.searchParams.get("scope") === "daily" ? "daily" : "global";
      const device = clean(url.searchParams.get("device"), 64);

      // `metric` is validated against the METRICS allowlist above, so it is
      // safe to interpolate as a column name.
      const where = scope === "daily" ? "WHERE date = ?" : "";
      const args = scope === "daily" ? [todayStr()] : [];

      const all = this.sql
        .exec(`SELECT * FROM scores ${where} ORDER BY ${metric} DESC, deviceId ASC`, ...args)
        .toArray() as unknown as Row[];

      const entries = all.slice(0, 50);
      const rank = device ? all.findIndex((r) => r.deviceId === device) + 1 : 0;
      return Response.json({ entries, rank, total: all.length });
    }

    if (url.pathname === "/score" && request.method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return Response.json({ error: "invalid json" }, { status: 400 });
      }

      const deviceId = clean(body.deviceId, 64);
      if (!deviceId) return Response.json({ error: "deviceId required" }, { status: 400 });

      const row: Row = {
        deviceId,
        name: clean(body.name, 14) || "Pilot",
        skin: clean(body.skin, 24) || "sunbird",
        distance: clampNum(body.distance, 500_000),
        altitude: clampNum(body.altitude, 10_000),
        perfects: clampNum(body.perfects, 5_000),
        coins: clampNum(body.coins, 100_000),
        score: clampNum(body.score, 5_000_000),
        date: todayStr(),
      };

      // One row per device; only a better distance replaces the old run.
      this.sql.exec(
        `INSERT INTO scores (deviceId, name, skin, distance, altitude, perfects, coins, score, date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(deviceId) DO UPDATE SET
           name = excluded.name,
           skin = excluded.skin,
           distance = excluded.distance,
           altitude = excluded.altitude,
           perfects = excluded.perfects,
           coins = excluded.coins,
           score = excluded.score,
           date = excluded.date
         WHERE excluded.distance > scores.distance`,
        row.deviceId,
        row.name,
        row.skin,
        row.distance,
        row.altitude,
        row.perfects,
        row.coins,
        row.score,
        row.date,
      );

      return Response.json({ ok: true });
    }

    return Response.json({ error: "not found" }, { status: 404 });
  }
}
