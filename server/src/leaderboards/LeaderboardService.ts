/**
 * LeaderboardService — server-validated scores with idempotency, anti-cheat
 * quarantine, privacy-filtered reads, rank recalculation, season snapshots,
 * around-me pages, and duplicate-reward prevention.
 *
 * Rank is computed lazily at read time over the (small, bounded) score set —
 * "rank recalculation" is exact by construction, and every invalidation
 * immediately changes the next read. Season snapshots freeze a full ranking
 * at season end (or on demand) so historical ladders survive data growth.
 */
import type { Ctx } from "../core/ctx.js";
import { HttpError, cleanText, boundedNum } from "../util/http.js";
import { seasonId as seasonIdOf } from "../util/id.js";
import { validateScoreSubmission, serverScoreFor } from "../anticheat/limits.js";
import type { BoardEntry, BoardMetric, BoardPage, BoardScope, ScoreRow, SeasonSnapshot } from "../types.js";

const PAGE_SIZE = 50;
const AROUND_ME_RADIUS = 25;
const MAX_SUBMISSIONS_PER_MIN = 30;
const SUBMISSION_WINDOW_MS = 60_000;

const METRICS: BoardMetric[] = ["distance", "altitude", "perfects", "coins", "score"];

export class LeaderboardService {
  constructor(private ctx: Ctx) {}

  /* ------------------------------------------------------------- submission */

  submit(
    playerId: string,
    input: {
      runId?: unknown;
      name?: unknown;
      skin?: unknown;
      distance?: unknown;
      altitude?: unknown;
      perfects?: unknown;
      coins?: unknown;
      score?: unknown;
      durationMs?: unknown;
      seed?: unknown;
      mode?: unknown;
      date?: unknown;
    },
  ): { status: "accepted" | "duplicate" | "quarantined"; runId: string; rank?: number; quarantinedReason?: string } {
    if (this.ctx.identity.isSuspended(playerId)) throw new HttpError(403, "account suspended", "suspended");
    const now = this.ctx.now();

    // Duplicate submission protection: one row per runId, ever.
    const runId =
      typeof input.runId === "string" && input.runId.length > 0 && input.runId.length <= 80
        ? input.runId
        : `r_${playerId.slice(2)}_${now.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
    const existingIdx = this.ctx.db.state.scoreIndex[runId];
    if (existingIdx !== undefined) {
      const existing = this.ctx.db.state.scores[existingIdx];
      if (existing && existing.playerId === playerId) return { status: "duplicate", runId };
      throw new HttpError(409, "runId already used by another pilot", "runIdConflict");
    }

    // Per-player write cadence (30/min).
    const recent = this.submissionTimes(playerId, now, SUBMISSION_WINDOW_MS);
    if (recent.length >= MAX_SUBMISSIONS_PER_MIN) {
      throw new HttpError(429, "too many submissions — slow down", "rateLimited", 30_000);
    }

    const distance = Math.round(boundedNum(input.distance, 500_000));
    const altitude = Math.round(boundedNum(input.altitude, 10_000));
    const perfects = Math.round(boundedNum(input.perfects, 5_000));
    const coins = Math.round(boundedNum(input.coins, 100_000));
    const score = Math.round(boundedNum(input.score, 5_000_000));
    const durationMs = Math.round(boundedNum(input.durationMs, 3_600_000));
    const validation = validateScoreSubmission({ distance, altitude, perfects, coins, score, durationMs });

    const profile = this.ctx.identity.requireProfile(playerId);
    const row: ScoreRow = {
      runId,
      playerId,
      name: cleanText(input.name, 14) || profile.displayName,
      skin: cleanText(input.skin, 24) || "sunbird",
      distance,
      altitude,
      perfects,
      coins,
      score: score > 0 ? score : serverScoreFor(distance),
      durationMs,
      seed: typeof input.seed === "string" ? input.seed.slice(0, 64) : "",
      mode: cleanText(input.mode, 32) || "daytrip",
      date: this.resolveDay(input.date, now),
      createdAt: new Date(now).toISOString(),
      seasonId: seasonIdOf(now),
      status: validation.ok ? "active" : "quarantined",
      quarantinedReason: validation.ok ? undefined : (validation.reason ?? "implausible"),
    };

    if (!validation.ok) {
      this.insert(row);
      this.openCase("quarantinedScore", runId, playerId, row.quarantinedReason!);
      this.ctx.audit.log(playerId, "score.quarantined", runId, { reason: row.quarantinedReason, distance, score });
      return { status: "quarantined", runId, quarantinedReason: row.quarantinedReason };
    }

    this.insert(row);
    this.ctx.audit.log(playerId, "score.submitted", runId, { distance, score });
    // Squad contribution hook (idempotent upstream via runId).
    this.ctx.squads.recordContribution(playerId, row);
    const rank = this.rankOf(playerId, "global", "distance");
    return { status: "accepted", runId, rank };
  }

  /** Legacy /score submission (deviceId-based, LEADERBOARD_API.md). */
  submitLegacy(input: {
    deviceId?: unknown;
    name?: unknown;
    skin?: unknown;
    distance?: unknown;
    altitude?: unknown;
    perfects?: unknown;
    coins?: unknown;
    score?: unknown;
    date?: unknown;
  }): { ok: boolean } {
    const deviceId = typeof input.deviceId === "string" ? input.deviceId.slice(0, 64) : "";
    if (!deviceId) throw new HttpError(400, "missing deviceId", "invalidDevice");
    // Map the legacy device identity onto a server player (idempotent link).
    const linked = this.linkDevice(deviceId, input.name);
    const now = this.ctx.now();
    const distance = Math.round(boundedNum(input.distance, 500_000));
    const altitude = Math.round(boundedNum(input.altitude, 10_000));
    const perfects = Math.round(boundedNum(input.perfects, 5_000));
    const coins = Math.round(boundedNum(input.coins, 100_000));
    const score = Math.round(boundedNum(input.score, 5_000_000));
    // Legacy clients never sent a run duration, so assume the game's
    // typical cruise average (15 m/s) when gating plausibility. Storing
    // that assumption keeps the row self-consistent on the board too.
    const assumedDurationMs = distance > 0 ? Math.max(1000, Math.round((distance / 15) * 1000)) : 0;
    const validation = validateScoreSubmission({
      distance,
      altitude,
      perfects,
      coins,
      score,
      durationMs: assumedDurationMs,
    });
    const profile = this.ctx.db.state.profiles[linked]!;
    const row: ScoreRow = {
      runId: `legacy_${deviceId.slice(0, 12)}_${Math.floor(now / 1000).toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
      playerId: linked,
      name: cleanText(input.name, 14) || profile.displayName,
      skin: cleanText(input.skin, 24) || "sunbird",
      distance,
      altitude,
      perfects,
      coins,
      score: score > 0 ? score : serverScoreFor(distance),
      durationMs: assumedDurationMs,
      seed: "",
      mode: "legacy",
      date: this.resolveDay(input.date, now),
      createdAt: new Date(now).toISOString(),
      seasonId: seasonIdOf(now),
      status: validation.ok ? "active" : "quarantined",
      quarantinedReason: validation.ok ? undefined : (validation.reason ?? "implausible"),
    };
    if (!validation.ok) {
      this.openCase("quarantinedScore", row.runId, linked, row.quarantinedReason!);
      this.ctx.audit.log(linked, "score.quarantined", row.runId, { reason: row.quarantinedReason });
    }
    // Legacy contract keeps the best row per pilot (by distance) — we keep
    // every row and reduce at read time, which is a strict superset.
    this.insert(row);
    return { ok: true };
  }

  /** Links a legacy deviceId to a (guest) profile idempotently. */
  private linkDevice(deviceId: string, name?: unknown): string {
    const s = this.ctx.db.state;
    const existing = s.guestLinks[deviceId];
    if (existing && s.profiles[existing]) return existing;
    // Reuse the identity service's guest creation for a canonical profile.
    const created = this.ctx.identity.createGuest({ deviceId, name });
    return created.playerId;
  }

  /* --------------------------------------------------------------- queries */

  /**
   * Personal best per pilot for the scope, privacy-filtered. Suspended
   * pilots, pilots with showOnLeaderboards=false, and quarantined/
   * invalidated rows never appear — the friends scope additionally requires
   * an active friendship.
   */
  get(
    scope: BoardScope,
    metric: BoardMetric,
    opts: { viewerId?: string; limit?: number; cursor?: string; seasonId?: string } | null = null,
  ): BoardPage {
    this.assertMetric(metric);
    const o = opts ?? {};
    const viewerId = o.viewerId ?? null;
    const limit = Math.min(PAGE_SIZE, Math.max(1, Math.floor(o.limit ?? PAGE_SIZE)));
    const rows = this.visibleRows(scope, metric, viewerId, o.seasonId);

    // Rank (exact, lazy) then paginate. Cursor = index after the last row.
    const rank = viewerId ? rows.findIndex((r) => r.playerId === viewerId) + 1 : 0;
    const start = o.cursor ? Math.max(0, Math.floor(Number(o.cursor)) || 0) : 0;
    const slice = rows.slice(start, start + limit);
    const entries: BoardEntry[] = slice.map((r, i) => ({
      rank: start + i + 1,
      playerId: r.playerId,
      name: r.name,
      skin: r.skin,
      distance: r.distance,
      altitude: r.altitude,
      perfects: r.perfects,
      coins: r.coins,
      score: r.score,
      date: r.date,
      you: r.playerId === viewerId,
    }));
    return {
      scope,
      metric,
      entries,
      yourRank: rank,
      total: rows.length,
      nextCursor: start + limit < rows.length ? String(start + limit) : null,
    };
  }

  /** A page centered on the viewer's rank (around-me). */
  aroundMe(playerId: string, scope: BoardScope, metric: BoardMetric): BoardPage {
    this.assertMetric(metric);
    const rows = this.visibleRows(scope, metric, playerId);
    const idx = rows.findIndex((r) => r.playerId === playerId);
    const center = idx === -1 ? 0 : idx;
    const start = Math.max(0, center - AROUND_ME_RADIUS);
    const end = Math.min(rows.length, center + AROUND_ME_RADIUS + 1);
    const entries: BoardEntry[] = rows.slice(start, end).map((r, i) => ({
      rank: start + i + 1,
      playerId: r.playerId,
      name: r.name,
      skin: r.skin,
      distance: r.distance,
      altitude: r.altitude,
      perfects: r.perfects,
      coins: r.coins,
      score: r.score,
      date: r.date,
      you: r.playerId === playerId,
    }));
    return { scope, metric, entries, yourRank: idx + 1, total: rows.length, nextCursor: null };
  }

  /** Legacy /board contract (deviceId keying). */
  legacyBoard(deviceId: string, scope: BoardScope, metric: BoardMetric): { entries: BoardEntry[]; rank: number; total: number } {
    const metricSafe: BoardMetric = metric === "score" ? "distance" : metric;
    this.assertMetric(metricSafe);
    const linked = this.ctx.db.state.guestLinks[deviceId];
    const page = this.get(scope === "friends" ? "global" : scope, metricSafe, {
      viewerId: linked ?? undefined,
      limit: 50,
    });
    return {
      entries: page.entries.map((e) => ({ ...e })),
      rank: page.yourRank,
      total: page.total,
    };
  }

  /** Best distance for a player (friend list display). */
  bestDistanceFor(playerId: string): number {
    let best = 0;
    for (const r of this.ctx.db.state.scores) {
      if (r.playerId === playerId && r.status === "active" && r.distance > best) best = r.distance;
    }
    return best;
  }

  rankOf(playerId: string, scope: BoardScope, metric: BoardMetric): number {
    this.assertMetric(metric);
    const rows = this.visibleRows(scope, metric, playerId);
    return rows.findIndex((r) => r.playerId === playerId) + 1;
  }

  /**
   * Invalidation (moderation or self): removes a score from every board
   * immediately (lazy rank recalculation) and records the rollback.
   */
  invalidateScore(playerId: string, runId: string, byModerator: boolean, reason: string): void {
    const idx = this.ctx.db.state.scoreIndex[runId];
    if (idx === undefined) throw new HttpError(404, "score not found", "notFound");
    if (idx < 0) throw new HttpError(404, "not a leaderboard score (tournament run)", "notFound");
    const row = this.ctx.db.state.scores[idx];
    if (!row) throw new HttpError(404, "score not found", "notFound");
    if (!byModerator && row.playerId !== playerId) throw new HttpError(403, "not your score", "forbidden");
    if (row.status === "invalidated") return;
    row.status = "invalidated";
    this.ctx.db.touch();
    this.ctx.audit.log(byModerator ? "moderator" : playerId, "score.invalidated", runId, { reason });
  }

  /** Roll back ALL of a player's scores (leaderboard rollback tool). */
  invalidateAll(playerId: string, reason: string): number {
    let n = 0;
    for (const row of this.ctx.db.state.scores) {
      if (row.playerId === playerId && row.status !== "invalidated") {
        row.status = "invalidated";
        n++;
      }
    }
    if (n > 0) this.ctx.db.touch();
    this.ctx.audit.log("moderator", "score.rollback_all", playerId, { count: n, reason });
    return n;
  }

  /**
   * Duplicate-reward prevention: a one-shot reward per grantKey — e.g.
   * "first time you hit the global top-50 this season". Returns the grant
   * time, or null when already granted.
   */
  grantOnce(grantKey: string): string | null {
    const s = this.ctx.db.state;
    if (s.grants[grantKey]) return s.grants[grantKey];
    const at = new Date(this.ctx.now()).toISOString();
    s.grants[grantKey] = at;
    this.ctx.db.touch();
    this.ctx.audit.log("system", "reward.granted", grantKey);
    return at;
  }

  /* ---------------------------------------------------------------- seasons */

  /** Freeze the current ranking for a season (top 500 per metric). */
  snapshotSeason(seasonId: string, reason: "season-end" | "manual" | "rollback"): SeasonSnapshot {
    const perMetric: SeasonSnapshot["perMetric"] = {};
    for (const metric of METRICS) {
      const rows = this.visibleRows("global", metric, null, seasonId);
      perMetric[metric] = {
        top: rows.slice(0, 500).map((r) => ({
          playerId: r.playerId,
          name: r.name,
          skin: r.skin,
          distance: r.distance,
          altitude: r.altitude,
          perfects: r.perfects,
          coins: r.coins,
          score: r.score,
          date: r.date,
        })),
        total: rows.length,
      };
    }
    const snap: SeasonSnapshot = {
      seasonId,
      capturedAt: new Date(this.ctx.now()).toISOString(),
      reason,
      perMetric,
    };
    this.ctx.db.state.seasons[seasonId] = snap;
    this.ctx.db.touch();
    this.ctx.audit.log("system", "season.snapshot", seasonId, { reason });
    return snap;
  }

  season(seasonId: string): SeasonSnapshot | null {
    return this.ctx.db.state.seasons[seasonId] ?? null;
  }

  seasons(): SeasonSnapshot[] {
    return Object.values(this.ctx.db.state.seasons).sort((a, b) => b.seasonId.localeCompare(a.seasonId));
  }

  /* --------------------------------------------------------------- internal */

  private visibleRows(scope: BoardScope, metric: BoardMetric, viewerId: string | null, seasonId?: string): ScoreRow[] {
    const s = this.ctx.db.state;
    const today = new Date(this.ctx.now()).toISOString().slice(0, 10);
    const friendSet = viewerId ? new Set(this.ctx.friends.friendIds(viewerId)) : null;
    // The friends board is "you + your friends" — otherwise a viewer whose
    // friends haven't posted would see a board missing themselves.
    if (scope === "friends" && viewerId) friendSet?.add(viewerId);

    // Best row per player for this scope (privacy + moderation filtered).
    const best = new Map<string, ScoreRow>();
    for (const row of s.scores) {
      if (row.status !== "active") continue;
      if (seasonId && row.seasonId !== seasonId) continue;
      if (scope === "daily" && row.date !== today) continue;
      if (scope === "friends" && (!friendSet || !friendSet.has(row.playerId))) continue;
      const profile = s.profiles[row.playerId];
      if (!profile) continue;
      if (profile.moderation.status === "suspended") continue;
      if (!profile.privacy.showOnLeaderboards && row.playerId !== viewerId) continue;
      const prev = best.get(row.playerId);
      if (
        !prev ||
        this.metricValue(row, metric) > this.metricValue(prev, metric) ||
        (this.metricValue(row, metric) === this.metricValue(prev, metric) && row.createdAt > prev.createdAt)
      ) {
        best.set(row.playerId, row);
      }
    }
    const rows = [...best.values()];
    rows.sort((a, b) => this.metricValue(b, metric) - this.metricValue(a, metric) || a.createdAt.localeCompare(b.createdAt));
    return rows;
  }

  private metricValue(row: ScoreRow, metric: BoardMetric): number {
    return row[metric];
  }

  private assertMetric(metric: BoardMetric): void {
    if (!METRICS.includes(metric)) {
      throw new HttpError(400, `metric must be one of ${METRICS.join("|")}`, "invalidMetric");
    }
  }

  private submissionTimes(playerId: string, now: number, windowMs: number): number[] {
    const out: number[] = [];
    for (const r of this.ctx.db.state.scores) {
      if (r.playerId !== playerId) continue;
      const t = Date.parse(r.createdAt);
      if (now - t < windowMs) out.push(t);
    }
    return out;
  }

  private insert(row: ScoreRow): void {
    const s = this.ctx.db.state;
    const idx = s.scores.length;
    s.scores.push(row);
    s.scoreIndex[row.runId] = idx;
    this.ctx.db.touch();
  }

  private openCase(kind: "quarantinedScore", targetId: string, byId: string, reason: string): void {
    const s = this.ctx.db.state;
    const open = s.moderationCases.some((c) => c.kind === kind && c.targetId === targetId && c.status === "open");
    if (open) return;
    s.moderationCases.push({
      id: `mc_${s.moderationCases.length.toString(36)}_${Math.floor(this.ctx.now()).toString(36)}`,
      kind,
      targetId,
      byId,
      reason,
      createdAt: new Date(this.ctx.now()).toISOString(),
      status: "open",
    });
    this.ctx.db.touch();
  }

  /**
   * Accept the client's local day only when it's a real calendar date within
   * ±2 days of the server day (a tampered payload can't plant a score on an
   * arbitrary historical board).
   */
  private resolveDay(clientDate: unknown, now: number): string {
    const today = new Date(now).toISOString().slice(0, 10);
    const raw = typeof clientDate === "string" ? clientDate.slice(0, 10) : "";
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!m) return today;
    const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (Number.isNaN(t)) return today;
    const d = new Date(t);
    if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return today;
    const nowT = Date.parse(`${today}T00:00:00Z`);
    return Math.abs(t - nowT) <= 2 * 86_400_000 ? raw : today;
  }
}
