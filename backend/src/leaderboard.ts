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

async function hmacHex(salt: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(salt), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class LeaderboardDO implements DurableObject {
  private readonly sql: SqlStorage;
  /** When LEADERBOARD_SALT is configured, unsigned submissions are rejected.
   * Honest scope: the salt ships inside the client bundle, so this deters
   * casual curl-spoofing — the plausibility gates below are the real teeth. */
  private readonly salt: string;

  constructor(state: DurableObjectState, env: unknown) {
    this.salt = String((env as { LEADERBOARD_SALT?: string })?.LEADERBOARD_SALT ?? "");
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
      CREATE TABLE IF NOT EXISTS entitlements (
        deviceId  TEXT NOT NULL,
        sku       TEXT NOT NULL,
        sessionId TEXT NOT NULL DEFAULT '',
        grantedAt TEXT NOT NULL,
        PRIMARY KEY (deviceId, sku)
      );
      CREATE TABLE IF NOT EXISTS ghosts (
        seed     TEXT NOT NULL,
        deviceId TEXT NOT NULL,
        name     TEXT NOT NULL,
        distance INTEGER NOT NULL,
        samples  TEXT NOT NULL,
        date     TEXT NOT NULL,
        PRIMARY KEY (seed, deviceId)
      );
      CREATE INDEX IF NOT EXISTS idx_ghosts_seed ON ghosts(seed, distance);
      CREATE TABLE IF NOT EXISTS telemetry (
        day  TEXT NOT NULL,
        k    TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT '',
        n    INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (day, k, mode)
      );
    `);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/entitlements/grant" && request.method === "POST") {
      // Internal route: only the worker's verified webhook handler calls this.
      let body: { deviceId?: unknown; sku?: unknown; sessionId?: unknown };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return Response.json({ error: "invalid json" }, { status: 400 });
      }
      const deviceId = clean(typeof body.deviceId === "string" ? body.deviceId : "", 64);
      const sku = clean(typeof body.sku === "string" ? body.sku : "", 32);
      if (!deviceId || !sku) return Response.json({ error: "deviceId and sku required" }, { status: 400 });
      this.sql.exec(
        `INSERT INTO entitlements (deviceId, sku, sessionId, grantedAt) VALUES (?, ?, ?, ?)
         ON CONFLICT(deviceId, sku) DO UPDATE SET sessionId = excluded.sessionId`,
        deviceId,
        sku,
        clean(typeof body.sessionId === "string" ? body.sessionId : "", 128),
        new Date().toISOString(),
      );
      return Response.json({ ok: true });
    }

    if (url.pathname === "/entitlements" && request.method === "GET") {
      const device = clean(url.searchParams.get("device"), 64);
      if (!device) return Response.json({ error: "device required" }, { status: 400 });
      const rows = this.sql
        .exec("SELECT sku, grantedAt FROM entitlements WHERE deviceId = ?", device)
        .toArray() as { sku: string; grantedAt: string }[];
      return Response.json({ entitlements: rows });
    }

    if (url.pathname === "/ghost" && request.method === "POST") {
      // Async PvP: publish your best daily-seed flight as a replayable ghost.
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return Response.json({ error: "invalid json" }, { status: 400 });
      }
      const seed = clean(typeof body.seed === "string" ? body.seed : "", 32);
      const deviceId = clean(typeof body.deviceId === "string" ? body.deviceId : "", 64);
      const name = clean(typeof body.name === "string" ? body.name : "", 24) || "Pilot";
      const distance = Math.floor(Number(body.distance) || 0);
      if (!seed || !deviceId) return Response.json({ error: "seed and deviceId required" }, { status: 400 });
      if (distance <= 0 || distance > 60_000) return Response.json({ error: "implausible distance" }, { status: 422 });
      if (!Array.isArray(body.samples) || body.samples.length < 5) {
        return Response.json({ error: "samples required" }, { status: 400 });
      }
      // Cap replay weight: 1500 samples of [t,x,y,rot] is ~7 min of flight.
      const samples = (body.samples as unknown[]).slice(0, 1500).filter(
        (s) => Array.isArray(s) && s.length === 4 && (s as unknown[]).every((n) => typeof n === "number" && Number.isFinite(n as number)),
      );
      if (samples.length < 5) return Response.json({ error: "samples malformed" }, { status: 400 });
      const packed = JSON.stringify(samples);
      if (packed.length > 131_072) return Response.json({ error: "replay too large" }, { status: 413 });
      // Keep only each pilot's best flight per seed.
      const prev = this.sql
        .exec("SELECT distance FROM ghosts WHERE seed = ? AND deviceId = ?", seed, deviceId)
        .toArray() as { distance: number }[];
      if (prev.length > 0 && prev[0]!.distance >= distance) {
        return Response.json({ ok: true, kept: "previous" });
      }
      this.sql.exec(
        `INSERT INTO ghosts (seed, deviceId, name, distance, samples, date) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(seed, deviceId) DO UPDATE SET name = excluded.name, distance = excluded.distance,
           samples = excluded.samples, date = excluded.date`,
        seed,
        deviceId,
        name,
        distance,
        packed,
        todayStr(),
      );
      return Response.json({ ok: true, kept: "new" });
    }

    if (url.pathname === "/ghost" && request.method === "GET") {
      // Serve the rival ghost closest to (just above) the requester's best —
      // a target you can realistically chase, never your own flight back.
      const seed = clean(url.searchParams.get("seed"), 32);
      const device = clean(url.searchParams.get("device"), 64);
      const near = Math.max(0, Math.floor(Number(url.searchParams.get("near")) || 0));
      if (!seed) return Response.json({ error: "seed required" }, { status: 400 });
      const rows = this.sql
        .exec(
          `SELECT deviceId, name, distance, samples FROM ghosts
           WHERE seed = ? AND deviceId != ?
           ORDER BY ABS(distance - ?) ASC LIMIT 5`,
          seed,
          device,
          Math.round(near * 1.15) + 150,
        )
        .toArray() as { deviceId: string; name: string; distance: number; samples: string }[];
      if (rows.length === 0) return Response.json({ ghost: null });
      const pick = rows[Math.floor(Math.random() * rows.length)]!;
      return Response.json({
        ghost: { name: pick.name, distance: pick.distance, samples: JSON.parse(pick.samples) as unknown },
      });
    }

    if (url.pathname === "/telemetry" && request.method === "POST") {
      // Aggregate-only product counters. No per-device rows are stored; the
      // deviceId in the payload is discarded after basic shape validation.
      let body: { events?: { k?: unknown; mode?: unknown }[] };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return Response.json({ error: "invalid json" }, { status: 400 });
      }
      const events = Array.isArray(body.events) ? body.events.slice(0, 64) : [];
      const day = todayStr();
      for (const ev of events) {
        const k = clean(typeof ev.k === "string" ? ev.k : "", 32);
        if (!k) continue;
        const mode = clean(typeof ev.mode === "string" ? ev.mode : "", 16);
        this.sql.exec(
          `INSERT INTO telemetry (day, k, mode, n) VALUES (?, ?, ?, 1)
           ON CONFLICT(day, k, mode) DO UPDATE SET n = n + 1`,
          day,
          k,
          mode,
        );
      }
      return Response.json({ ok: true });
    }

    if (url.pathname === "/telemetry" && request.method === "GET") {
      const rows = this.sql
        .exec("SELECT day, k, mode, n FROM telemetry ORDER BY day DESC, n DESC LIMIT 200")
        .toArray();
      return Response.json({ rows });
    }

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

      // Signature gate (when configured): sig = HMAC-SHA256(salt, deviceId|distance|score).
      if (this.salt) {
        const expected = await hmacHex(this.salt, `${deviceId}|${clampNum(body.distance, 500_000)}|${clampNum(body.score, 5_000_000)}`);
        if (clean(body.sig, 128) !== expected) {
          return Response.json({ error: "bad signature" }, { status: 403 });
        }
      }

      // Plausibility gates — server-enforceable physics limits. A legit run
      // cannot post 100km, nor a score wildly out of line with its distance.
      const dist = clampNum(body.distance, 500_000);
      const score = clampNum(body.score, 5_000_000);
      if (dist > 60_000) return Response.json({ error: "implausible distance" }, { status: 422 });
      if (score > dist * 40 + 50_000) return Response.json({ error: "implausible score" }, { status: 422 });

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
