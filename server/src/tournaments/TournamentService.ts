/**
 * TournamentService — lifecycle (create → registration → active → finished
 * | canceled), server-validated results, tiered standings, and
 * server-issued rewards with duplicate prevention via a stable grant ledger.
 *
 * Seasonal behaviour: tournaments carry a seasonId; at finish the standings
 * are snapshotted (historical) and per-season reward claims cannot carry
 * over (duplicate reward prevention).
 */
import type { Ctx } from "../core/ctx.js";
import { HttpError, cleanText, boundedNum } from "../util/http.js";
import { randomId, seasonId as seasonIdOf, weekKey } from "../util/id.js";
import { validateScoreSubmission } from "../anticheat/limits.js";
import type { BoardMetric, Prize, Tournament, TournamentStanding, TrophyTier } from "../types.js";

const TIER_ORDER: TrophyTier[] = ["bronze", "silver", "gold", "diamond"];
const METRICS: BoardMetric[] = ["distance", "altitude", "perfects", "coins", "score"];
const MAX_ENTRIES = 1000;
const NAME_MAX = 40;

export type TournamentDefInput = {
  name?: unknown;
  blurb?: unknown;
  icon?: unknown;
  mode?: unknown;
  metric?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  registrationClosesAt?: unknown;
  cuts?: unknown;
  prizes?: unknown;
  seasonId?: unknown;
  maxEntries?: unknown;
};

export class TournamentService {
  constructor(private ctx: Ctx) {}

  /* ------------------------------------------------------------ lifecycle */

  /** Moderation only: create a tournament (phase = registration). */
  create(input: TournamentDefInput): Tournament {
    const name = cleanText(input.name, NAME_MAX);
    if (!name) throw new HttpError(400, "name is required", "invalidName");
    const metric = (typeof input.metric === "string" ? input.metric : "distance") as BoardMetric;
    if (!METRICS.includes(metric)) throw new HttpError(400, "bad metric", "invalidMetric");
    const now = this.ctx.now();
    const startsAt = this.epoch(input.startsAt) ?? now;
    const endsAt = this.epoch(input.endsAt) ?? now + 7 * 86_400_000;
    if (endsAt <= startsAt) throw new HttpError(400, "endsAt must be after startsAt", "invalidWindow");

    const cutsRaw = (input.cuts ?? {}) as Record<string, unknown>;
    const cuts: Record<TrophyTier, number> = {
      bronze: Math.round(boundedNum(cutsRaw.bronze, 10_000_000)),
      silver: Math.round(boundedNum(cutsRaw.silver, 10_000_000)),
      gold: Math.round(boundedNum(cutsRaw.gold, 10_000_000)),
      diamond: Math.round(boundedNum(cutsRaw.diamond, 10_000_000)),
    };
    if (cuts.bronze >= cuts.silver || cuts.silver >= cuts.gold || cuts.gold >= cuts.diamond) {
      throw new HttpError(400, "cuts must be strictly ascending", "invalidCuts");
    }

    const prizesRaw = (input.prizes ?? {}) as Record<string, unknown>;
    const prizes = {} as Record<TrophyTier, Prize>;
    for (const tier of TIER_ORDER) {
      const p = (prizesRaw[tier] ?? {}) as Record<string, unknown>;
      prizes[tier] = {
        kind: (["coins", "skin", "boost", "trail", "title"].includes(String(p.kind)) ? String(p.kind) : "coins") as Prize["kind"],
        id: cleanText(p.id, 40) || `prize_${tier}`,
        amount: Math.round(boundedNum(p.amount, 1_000_000)),
        label: cleanText(p.label, 60) || `${tier} prize`,
      };
    }

    const id = randomId("t");
    const t: Tournament = {
      id,
      name,
      blurb: cleanText(input.blurb, 160),
      icon: cleanText(input.icon, 8) || "🏆",
      mode: cleanText(input.mode, 32) || "distance",
      metric,
      seasonId: typeof input.seasonId === "string" ? input.seasonId.slice(0, 16) : seasonIdOf(now),
      phase: "registration",
      createdAt: new Date(now).toISOString(),
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      registrationClosesAt: new Date(this.epoch(input.registrationClosesAt) ?? Math.min(startsAt, endsAt)).toISOString(),
      cuts,
      prizes,
      entries: {},
      rewardLedger: {},
      standingsSnapshot: null,
      distributedAt: null,
      maxEntries: Math.min(MAX_ENTRIES, Math.max(10, Math.floor(boundedNum(input.maxEntries, MAX_ENTRIES)) || 250)),
    };
    this.ctx.db.state.tournaments[id] = t;
    this.ctx.db.touch();
    this.ctx.audit.log("moderator", "tournament.created", t.id, { name, metric, seasonId: t.seasonId });
    return t;
  }

  openRegistration(id: string): Tournament {
    const t = this.require(id);
    if (t.phase !== "draft" && t.phase !== "registration") throw new HttpError(409, "registration already closed", "badPhase");
    t.phase = "registration";
    this.touch(t);
    this.ctx.audit.log("moderator", "tournament.registration_open", id);
    return t;
  }

  closeRegistration(id: string): Tournament {
    const t = this.require(id);
    if (t.phase !== "registration") throw new HttpError(409, "registration is not open", "badPhase");
    t.phase = "active";
    this.touch(t);
    this.ctx.audit.log("moderator", "tournament.registration_closed", id);
    return t;
  }

  start(id: string): Tournament {
    const t = this.require(id);
    if (t.phase !== "registration" && t.phase !== "draft") throw new HttpError(409, "cannot start from this phase", "badPhase");
    if (this.ctx.now() < Date.parse(t.startsAt)) throw new HttpError(409, "starts later — schedule holds", "notStarted");
    t.phase = "active";
    this.touch(t);
    this.ctx.audit.log("moderator", "tournament.started", id);
    return t;
  }

  finish(id: string): Tournament {
    const t = this.require(id);
    if (t.phase !== "active") throw new HttpError(409, "tournament is not active", "badPhase");
    t.phase = "finished";
    t.standingsSnapshot = this.standings(t.id).map((s) => ({
      rank: s.rank,
      playerId: s.playerId,
      best: s.best,
      tier: s.tier,
    }));
    this.touch(t);
    // Historical snapshot for the season (idempotent per season).
    this.ctx.leaderboards.snapshotSeason(t.seasonId, "season-end");
    this.ctx.audit.log("moderator", "tournament.finished", id, { entries: Object.keys(t.entries).length });
    return t;
  }

  cancel(id: string): Tournament {
    const t = this.require(id);
    if (t.phase === "finished" || t.phase === "canceled") throw new HttpError(409, "already terminal", "badPhase");
    t.phase = "canceled";
    this.touch(t);
    this.ctx.audit.log("moderator", "tournament.canceled", id);
    return t;
  }

  /* -------------------------------------------------------------- entries */

  register(id: string, playerId: string): Tournament {
    if (this.ctx.identity.isSuspended(playerId)) throw new HttpError(403, "account suspended", "suspended");
    const t = this.require(id);
    if (t.phase !== "registration") throw new HttpError(409, "registration is closed", "registrationClosed");
    if (Object.keys(t.entries).length >= t.maxEntries) throw new HttpError(429, "tournament is full", "full");
    if (!t.entries[playerId]) {
      t.entries[playerId] = {
        playerId,
        best: 0,
        attempts: 0,
        runId: null,
        submittedAt: null,
        registeredAt: new Date(this.ctx.now()).toISOString(),
        claimedBest: 0,
      };
      this.touch(t);
      // Event participation: count the tournament on the player's squads.
      this.ctx.squads.noteEvent(playerId, t.id);
      this.ctx.audit.log(playerId, "tournament.registered", id);
    }
    return t;
  }

  /**
   * Result submission — active phase only, idempotent per runId, keeps the
   * player's best. Same plausibility gates as the leaderboard.
   */
  submitResult(
    id: string,
    playerId: string,
    input: {
      value?: unknown;
      runId?: unknown;
      distance?: unknown;
      altitude?: unknown;
      perfects?: unknown;
      coins?: unknown;
      score?: unknown;
      durationMs?: unknown;
    },
  ): { best: number; attempts: number } {
    if (this.ctx.identity.isSuspended(playerId)) throw new HttpError(403, "account suspended", "suspended");
    const t = this.require(id);
    if (t.phase !== "active") throw new HttpError(409, "tournament is not accepting results", "badPhase");
    const runId = typeof input.runId === "string" && input.runId ? input.runId.slice(0, 80) : null;
    if (runId && this.ctx.db.state.scoreIndex[runId] !== undefined) {
      // Duplicate submission protection across the whole platform.
      throw new HttpError(409, "result already submitted", "duplicate");
    }
    const value = Math.round(boundedNum(input.value, 10_000_000));
    if (value <= 0) throw new HttpError(400, "value must be positive", "invalidValue");
    const validation = validateScoreSubmission({
      distance: t.metric === "distance" ? value : boundedNum(input.distance, 500_000),
      altitude: t.metric === "altitude" ? value : boundedNum(input.altitude, 10_000),
      perfects: t.metric === "perfects" ? value : boundedNum(input.perfects, 5_000),
      coins: t.metric === "coins" ? value : boundedNum(input.coins, 100_000),
      score: t.metric === "score" ? value : boundedNum(input.score, 5_000_000),
      durationMs: boundedNum(input.durationMs, 3_600_000),
    });
    if (!validation.ok) throw new HttpError(422, `implausible result: ${validation.reason}`, "implausible");

    // Platform-wide runId dedup: tournament runs share the score index so a
    // run cannot be replayed across leaderboards and tournaments. (-1 is a
    // tombstone — tournament results are not leaderboard rows.)
    if (runId) this.ctx.db.state.scoreIndex[runId] = -1;
    const entry = t.entries[playerId] ?? this.registerInternal(t, playerId);
    entry.attempts += 1;
    if (value > entry.best) {
      entry.best = value;
      entry.runId = runId;
      entry.submittedAt = new Date(this.ctx.now()).toISOString();
    }
    this.touch(t);
    this.ctx.audit.log(playerId, "tournament.result", id, { value, best: entry.best });
    return { best: entry.best, attempts: entry.attempts };
  }

  /* ------------------------------------------------------------- standings */

  /** Tiered standings, best-first. */
  standings(id: string, viewerId?: string): TournamentStanding[] {
    const t = this.require(id);
    const rows = Object.values(t.entries)
      .map((e) => {
        const pub = this.ctx.db.state.profiles[e.playerId]
          ? this.ctx.identity.publicView(e.playerId, viewerId)
          : null;
        return {
          rank: 0,
          playerId: e.playerId,
          name: pub ? pub.displayName : "Pilot",
          best: e.best,
          attempts: e.attempts,
          tier: tierFor(t, e.best),
          you: e.playerId === viewerId,
        };
      })
      .sort((a, b) => b.best - a.best || a.playerId.localeCompare(b.playerId));
    rows.forEach((r, i) => (r.rank = i + 1));
    return rows;
  }

  view(id: string, _viewerId?: string): Tournament {
    const t = this.require(id);
    return { ...t, entries: { ...t.entries } };
  }

  list(phase?: Tournament["phase"]): Tournament[] {
    const all = Object.values(this.ctx.db.state.tournaments);
    const filtered = phase ? all.filter((t) => t.phase === phase) : all;
    return filtered.sort((a, b) => a.endsAt.localeCompare(b.endsAt));
  }

  active(): Tournament[] {
    return this.list("active");
  }

  /* --------------------------------------------------------------- rewards */

  /**
   * Server-side reward issuance: marks every entry that reached a tier as
   * distributed. Idempotent — the ledger (stable grantKey) prevents double
   * payout no matter how many times the operator clicks.
   */
  distributeRewards(id: string, byId = "moderator"): { granted: number } {
    const t = this.require(id);
    if (t.phase !== "active" && t.phase !== "finished") {
      throw new HttpError(409, "rewards only for live/finished tournaments", "badPhase");
    }
    let granted = 0;
    for (const entry of Object.values(t.entries)) {
      const tier = tierFor(t, entry.best);
      if (!tier) continue;
      const grantKey = `${id}:${entry.playerId}:${tier}`;
      // Ledger first — grantOnce creates the grant, it never returns null
      // for a new key, so checking it afterwards would double-pay.
      if (t.rewardLedger[grantKey]) continue;
      if (t.cuts[tier] <= (entry.claimedBest ?? 0)) continue; // nothing above the banked best
      this.ctx.leaderboards.grantOnce(`tournament:${grantKey}`);
      t.rewardLedger[grantKey] = new Date(this.ctx.now()).toISOString();
      entry.claimedBest = Math.max(entry.claimedBest ?? 0, entry.best);
      granted += 1;
    }
    if (granted > 0) this.touch(t);
    if (!t.distributedAt && (t.phase === "finished" || granted > 0)) {
      t.distributedAt = new Date(this.ctx.now()).toISOString();
    }
    this.ctx.audit.log(byId, "tournament.rewards_distributed", id, { granted });
    return { granted };
  }

  /**
   * Player claim: the server verifies the tier was actually reached and the
   * grant isn't already banked (duplicate reward prevention). Returns the
   * prize so the client can apply the local unlock (skins/trails/etc.).
   */
  claimReward(id: string, playerId: string): { prize: Prize; tier: TrophyTier; cup: string } | null {
    const t = this.require(id);
    if (t.phase !== "active" && t.phase !== "finished") throw new HttpError(409, "no claims in this phase", "badPhase");
    const entry = t.entries[playerId];
    if (!entry) throw new HttpError(404, "not registered", "notRegistered");
    // Claim the HIGHEST reached tier not yet banked. A cut only pays out
    // if it sits ABOVE the best already banked — one run must never be
    // double-banked across tiers, while a genuinely improved best still
    // unlocks the next tier up.
    for (const tier of [...TIER_ORDER].reverse()) {
      if (entry.best < t.cuts[tier]) continue;
      if (t.cuts[tier] <= (entry.claimedBest ?? 0)) continue;
      const grantKey = `${id}:${playerId}:${tier}`;
      if (t.rewardLedger[grantKey]) continue;
      this.ctx.leaderboards.grantOnce(`tournament:${grantKey}`);
      t.rewardLedger[grantKey] = new Date(this.ctx.now()).toISOString();
      entry.claimedBest = Math.max(entry.claimedBest ?? 0, entry.best);
      this.touch(t);
      this.ctx.audit.log(playerId, "tournament.reward_claimed", id, { tier });
      return { prize: t.prizes[tier], tier, cup: t.name };
    }
    return null;
  }

  /** Per-season leaderboard across all of that season's tournaments. */
  seasonLeaderboard(
    seasonId: string,
    viewerId?: string,
  ): { tournamentId: string; name: string; metric: BoardMetric; standings: TournamentStanding[] }[] {
    return this.list()
      .filter((t) => t.seasonId === seasonId)
      .map((t) => ({
        tournamentId: t.id,
        name: t.name,
        metric: t.metric,
        standings: this.standings(t.id, viewerId),
      }));
  }

  /** Which week's events a tournament belongs to (client display helper). */
  weekOf(t: Tournament): string {
    return weekKey(Date.parse(t.startsAt));
  }

  /* --------------------------------------------------------------- internal */

  private registerInternal(t: Tournament, playerId: string): Tournament["entries"][string] {
    t.entries[playerId] = {
      playerId,
      best: 0,
      attempts: 0,
      runId: null,
      submittedAt: null,
      registeredAt: new Date(this.ctx.now()).toISOString(),
      claimedBest: 0,
    };
    return t.entries[playerId]!;
  }

  private require(id: string): Tournament {
    const t = this.ctx.db.state.tournaments[id];
    if (!t) throw new HttpError(404, "tournament not found", "notFound");
    return t;
  }

  private touch(_t: Tournament): void {
    this.ctx.db.touch();
  }

  private epoch(v: unknown): number | null {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
      const t = Date.parse(v);
      if (!Number.isNaN(t)) return t;
    }
    return null;
  }
}

export function tierFor(t: Tournament, value: number): TrophyTier | null {
  if (value >= t.cuts.diamond) return "diamond";
  if (value >= t.cuts.gold) return "gold";
  if (value >= t.cuts.silver) return "silver";
  if (value >= t.cuts.bronze) return "bronze";
  return null;
}
