/**
 * Central in-memory database with optional JSON-file persistence.
 *
 * Design: one plain-JSON-able document, debounced atomic writes
 * (write temp file → rename). This keeps the server self-contained — no
 * external service required — while leaving a clean seam to swap in Redis or
 * Postgres per-collection for horizontal scale (see DEPLOY.md).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type {
  AchievementCounters,
  CloudSave,
  FriendRequest,
  GhostMeta,
  ModerationCase,
  PlayerProfile,
  ScoreRow,
  SeasonSnapshot,
  Squad,
  Tournament,
} from "../types.js";

export type DbState = {
  /** schema version for future migrations */
  schema: number;
  profiles: Record<string, PlayerProfile>;
  /** deviceId → playerId (guest device links). */
  guestLinks: Record<string, string>;
  /** `${platform}:${platformId}` → playerId. */
  platformLinks: Record<string, string>;
  /** playerCode → playerId (exact-code lookup index). */
  codeIndex: Record<string, string>;
  /** Revoked session tokens (HMAC is the primary check; this is the kill switch). */
  revokedTokens: string[];
  friendRequests: Record<string, FriendRequest>;
  /** friendship key `${a}|${b}` (sorted ids) → ISO time. */
  friendships: Record<string, string>;
  /** blockerId → blocked playerIds. */
  blocks: Record<string, string[]>;
  scores: ScoreRow[];
  /** runId → index into scores (idempotency + rollback lookup). */
  scoreIndex: Record<string, number>;
  ghosts: GhostMeta[];
  /** ghostId → meta index. */
  ghostIndex: Record<string, number>;
  tournaments: Record<string, Tournament>;
  /** grantKey `${tournamentId}:${playerId}:${tier}` → ISO time (duplicate reward prevention). */
  rewardLedger: Record<string, string>;
  squads: Record<string, Squad>;
  saves: Record<string, CloudSave>;
  seasons: Record<string, SeasonSnapshot>;
  /** reward grants outside tournaments: grantKey → ISO time. */
  grants: Record<string, string>;
  moderationCases: ModerationCase[];
};

export function emptyDbState(): DbState {
  return {
    schema: 1,
    profiles: {},
    guestLinks: {},
    platformLinks: {},
    codeIndex: {},
    revokedTokens: [],
    friendRequests: {},
    friendships: {},
    blocks: {},
    scores: [],
    scoreIndex: {},
    ghosts: [],
    ghostIndex: {},
    tournaments: {},
    rewardLedger: {},
    squads: {},
    saves: {},
    seasons: {},
    grants: {},
    moderationCases: [],
  };
}

export function friendshipKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function emptyCounters(): AchievementCounters {
  return {
    runsPlayed: 0,
    lifetimeDistance: 0,
    lifetimeCoins: 0,
    zeniths: 0,
    ghostBeats: 0,
    duelWins: 0,
    racesRun: 0,
    streakDays: 0,
    bestAltitude: 0,
  };
}

/**
 * Storage health as reported by /health. `mode: "memory"` is an honest
 * label for the no-persistence development mode (data resets on restart),
 * and `ok: false` means the file backend exists but the last write failed —
 * the server keeps serving (data is still in RAM) but the probe goes red so
 * a failing disk is never silently absorbed.
 */
export interface DbStorageStatus {
  mode: "memory" | "file";
  ok: boolean;
  detail: string | null;
}

export class Db {
  state: DbState;
  private file: string | null;
  private saveTimer: NodeJS.Timeout | null = null;
  private dirty = false;
  private flushError: string | null = null;

  constructor(
    state?: DbState,
    file?: string | null,
    private readonly flushDelayMs = 500,
  ) {
    this.state = state ?? emptyDbState();
    this.file = file ?? null;
    if (this.file) this.load();
  }

  /** Marks the state dirty and schedules a debounced flush. */
  touch(): void {
    if (!this.file) return;
    this.dirty = true;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (this.dirty) this.flush();
    }, this.flushDelayMs);
    this.saveTimer.unref?.();
  }

  flush(): void {
    if (!this.file || !this.dirty) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.state));
      renameSync(tmp, this.file);
      this.dirty = false;
      if (this.flushError !== null) {
        this.flushError = null;
        console.log(`[store] persistence recovered — ${this.file}`);
      }
    } catch (err) {
      // A failing disk (full, read-only, bad path) must neither crash the
      // process (the failure lands inside a timer callback) nor pretend the
      // state is durable. Keep it dirty so the next touch retries, and
      // surface the failure in /health.
      this.dirty = true;
      this.flushError = err instanceof Error ? err.message : String(err);
      console.error(`[store] PERSISTENCE FAILURE — state is in-memory only until the disk recovers: ${this.flushError} (${this.file})`);
    }
  }

  close(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.flush();
    if (this.flushError) {
      console.error(`[store] close() exited with a pending persistence failure: ${this.flushError}`);
    }
  }

  storageStatus(): DbStorageStatus {
    if (!this.file) return { mode: "memory", ok: true, detail: null };
    return this.flushError
      ? { mode: "file", ok: false, detail: this.flushError }
      : { mode: "file", ok: true, detail: null };
  }

  private load(): void {
    if (!this.file) return;
    if (!existsSync(this.file)) return; // first boot — nothing to load
    let raw: string;
    try {
      raw = readFileSync(this.file, "utf8");
    } catch (err) {
      // A file that exists but cannot be read is NOT a first boot. Starting
      // clean here would silently drop every profile, board and save on the
      // next restart — fail loud instead; ops recovers by renaming the file.
      throw new Error(
        `cannot read state file ${this.file}: ${err instanceof Error ? err.message : String(err)}. ` +
          `Move or repair the file and restart (refusing to start with a silently empty database).`,
      );
    }
    try {
      const parsed = JSON.parse(raw) as Partial<DbState>;
      this.state = { ...emptyDbState(), ...parsed };
    } catch (err) {
      throw new Error(
        `corrupt state file ${this.file}: ${err instanceof Error ? err.message : String(err)}. ` +
          `Move or repair the file and restart (refusing to start with a silently empty database).`,
      );
    }
  }

  /** Deep-clone helpers for snapshots (tests / rollback). */
  clone(): DbState {
    return JSON.parse(JSON.stringify(this.state)) as DbState;
  }
}

/**
 * Convenience: find a profile or throw. All services route through here so
 * "player must exist" is one line.
 */
export function requireProfile(db: Db, playerId: string): PlayerProfile {
  const p = db.state.profiles[playerId];
  if (!p) throw new Error(`unknown player ${playerId}`);
  return p;
}

export function dataFilePath(dataDir: string): string {
  return join(dataDir, "state.json");
}
