import { dateSeed } from "./math";

/**
 * Global leaderboard.
 *
 * Two execution paths, and the UI always states which one is live:
 *
 *  • ONLINE  — when `VITE_LEADERBOARD_URL` is configured the client talks to a
 *    real HTTP backend (`GET /board`, `POST /score`). Any host that speaks the
 *    tiny JSON contract documented in LEADERBOARD_API.md works.
 *  • LOCAL   — with no endpoint we keep a persistent on-device board. It is
 *    labelled "Local" everywhere in the UI; we never present device-only rows
 *    as if they were worldwide results.
 */

const API = (import.meta.env.VITE_LEADERBOARD_URL ?? (import.meta.env.DEV ? "/mp" : "")).replace(/\/$/, "");
const SALT = import.meta.env.VITE_LEADERBOARD_SALT ?? "";

async function signScore(deviceId: string, distance: number, score: number): Promise<string> {
  if (!SALT || !crypto?.subtle) return "";
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SALT), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${deviceId}|${distance}|${score}`));
    return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}
const KEY = "sunbird.board.v1";
const NAME_KEY = "sunbird.pilotname";

export type BoardScope = "global" | "daily" | "friends";
export type BoardMetric = "distance" | "altitude" | "perfects" | "coins";

export type BoardEntry = {
  id: string;
  name: string;
  value: number;
  distance: number;
  altitude: number;
  perfects: number;
  coins: number;
  skin: string;
  date: string;
  you: boolean;
};

export type BoardPage = {
  scope: BoardScope;
  metric: BoardMetric;
  entries: BoardEntry[];
  yourRank: number;
  total: number;
  online: boolean;
  stale: boolean;
  error: string;
};

export type ScoreSubmission = {
  deviceId: string;
  name: string;
  skin: string;
  distance: number;
  altitude: number;
  perfects: number;
  coins: number;
  score: number;
  seed: string;
  mode: string;
};

type StoredRow = ScoreSubmission & { date: string };

export function isLeaderboardOnline(): boolean {
  return API.length > 0;
}

export function loadPilotName(fallbackId: string): string {
  try {
    const v = localStorage.getItem(NAME_KEY);
    if (v && v.trim()) return v.trim().slice(0, 14);
  } catch {
    /* private mode */
  }
  return `Pilot ${fallbackId.slice(-4).toUpperCase()}`;
}

export function savePilotName(name: string): string {
  const clean = name.replace(/[^\p{L}\p{N} _.-]/gu, "").trim().slice(0, 14) || "Pilot";
  try {
    localStorage.setItem(NAME_KEY, clean);
  } catch {
    /* private mode */
  }
  return clean;
}

function metricOf(row: { distance: number; altitude: number; perfects: number; coins: number }, m: BoardMetric): number {
  if (m === "altitude") return row.altitude;
  if (m === "perfects") return row.perfects;
  if (m === "coins") return row.coins;
  return row.distance;
}

/* ----------------------------------------------------------- local store */

function readLocal(): StoredRow[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed as StoredRow[];
  } catch {
    return [];
  }
}

function writeLocal(rows: StoredRow[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows.slice(0, 400)));
  } catch {
    /* quota */
  }
}

/**
 * Rival pilots for the offline board. These are generated once per device from
 * a fixed table so the local ladder has texture, and every generated row is
 * flagged so the UI can mark it as a practice benchmark rather than a person.
 */
const BENCH_NAMES = [
  "Aria", "Kestrel", "Nomi", "Tavi", "Wren", "Bex", "Juno", "Pike", "Sable", "Fen",
  "Rook", "Vale", "Ivy", "Cass", "Odin", "Lux", "Nyx", "Brann", "Skye", "Ozzy",
];

function benchmarkRows(): StoredRow[] {
  const today = dateSeed();
  return BENCH_NAMES.map((name, i) => {
    // Deterministic spread from 380 m up to ~4.6 km so the ladder has a real curve.
    const t = i / (BENCH_NAMES.length - 1);
    const distance = Math.round(380 + Math.pow(t, 1.7) * 4200);
    return {
      deviceId: `bench-${i}`,
      name: `${name} ⟡`,
      skin: "sunbird",
      distance,
      altitude: Math.round(38 + t * 240),
      perfects: Math.round(1 + t * 22),
      coins: Math.round(8 + t * 120),
      score: Math.round(distance * 1.4),
      seed: today,
      mode: "daytrip",
      date: today,
    };
  });
}

/* ------------------------------------------------------------- service */

export class Leaderboard {
  private cache = new Map<string, BoardPage>();
  private inflight = new Map<string, Promise<BoardPage>>();
  private lastError = "";

  constructor(private readonly deviceId: string) {
    if (readLocal().length === 0) writeLocal(benchmarkRows());
  }

  /** Cached page for instant paint; `fetch()` refreshes it in the background. */
  peek(scope: BoardScope, metric: BoardMetric): BoardPage | null {
    return this.cache.get(`${scope}:${metric}`) ?? null;
  }

  async fetch(scope: BoardScope, metric: BoardMetric): Promise<BoardPage> {
    const key = `${scope}:${metric}`;
    const running = this.inflight.get(key);
    if (running) return running;

    const task = (async (): Promise<BoardPage> => {
      if (API) {
        try {
          const url = `${API}/board?scope=${scope}&metric=${metric}&device=${encodeURIComponent(this.deviceId)}`;
          const res = await fetch(url, { headers: { accept: "application/json" } });
          if (!res.ok) throw new Error(`board ${res.status}`);
          const data = (await res.json()) as { entries?: unknown; rank?: unknown; total?: unknown };
          const entries = Array.isArray(data.entries) ? data.entries.map((e) => this.normalize(e, metric)) : [];
          this.lastError = "";
          const page: BoardPage = {
            scope,
            metric,
            entries,
            yourRank: Number(data.rank) || entries.findIndex((e) => e.you) + 1,
            total: Number(data.total) || entries.length,
            online: true,
            stale: false,
            error: "",
          };
          this.cache.set(key, page);
          return page;
        } catch (e) {
          // Network failure must never blank the board — fall through to local
          // and clearly mark the page as stale.
          this.lastError = e instanceof Error ? e.message : "network error";
        }
      }
      const page = this.localPage(scope, metric);
      this.cache.set(key, page);
      return page;
    })();

    this.inflight.set(key, task);
    try {
      return await task;
    } finally {
      this.inflight.delete(key);
    }
  }

  /** Records a finished run. Always stored locally; POSTed when online. */
  submit(sub: ScoreSubmission): void {
    const row: StoredRow = { ...sub, date: dateSeed() };
    const rows = readLocal().filter((r) => r.deviceId !== sub.deviceId || r.date !== row.date);
    rows.push(row);
    rows.sort((a, b) => b.distance - a.distance);
    writeLocal(rows);
    this.cache.clear();

    if (!API) return;
    void signScore(row.deviceId, row.distance, row.score).then((sig) =>
      fetch(`${API}/score`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sig ? { ...row, sig } : row),
        keepalive: true,
      }),
    ).catch(() => {
      // Submission is best-effort; the local row already persisted so the
      // player never loses credit for the run.
    });
  }

  private normalize(raw: unknown, metric: BoardMetric): BoardEntry {
    const r = (raw ?? {}) as Record<string, unknown>;
    const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const base = {
      distance: num(r.distance),
      altitude: num(r.altitude),
      perfects: num(r.perfects),
      coins: num(r.coins),
    };
    const id = String(r.deviceId ?? r.id ?? "");
    return {
      id,
      name: String(r.name ?? "Pilot").slice(0, 14),
      value: metricOf(base, metric),
      ...base,
      skin: String(r.skin ?? "sunbird"),
      date: String(r.date ?? ""),
      you: id === this.deviceId,
    };
  }

  private localPage(scope: BoardScope, metric: BoardMetric): BoardPage {
    const today = dateSeed();
    let rows = readLocal();
    if (scope === "daily") rows = rows.filter((r) => r.date === today);
    if (scope === "friends") rows = rows.filter((r) => r.deviceId === this.deviceId || r.deviceId.startsWith("friend-"));

    // Keep only each pilot's personal best for the selected metric.
    const best = new Map<string, StoredRow>();
    for (const r of rows) {
      const prev = best.get(r.deviceId);
      if (!prev || metricOf(r, metric) > metricOf(prev, metric)) best.set(r.deviceId, r);
    }

    const sorted = [...best.values()].sort((a, b) => metricOf(b, metric) - metricOf(a, metric));
    const entries: BoardEntry[] = sorted.slice(0, 50).map((r) => ({
      id: r.deviceId,
      name: r.name,
      value: metricOf(r, metric),
      distance: r.distance,
      altitude: r.altitude,
      perfects: r.perfects,
      coins: r.coins,
      skin: r.skin,
      date: r.date,
      you: r.deviceId === this.deviceId,
    }));
    const rank = sorted.findIndex((r) => r.deviceId === this.deviceId) + 1;
    return {
      scope,
      metric,
      entries,
      yourRank: rank,
      total: sorted.length,
      online: false,
      stale: Boolean(API) && this.lastError.length > 0,
      error: API ? this.lastError : "",
    };
  }
}
