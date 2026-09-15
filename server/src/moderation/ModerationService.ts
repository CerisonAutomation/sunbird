/**
 * ModerationService — manual review tools and enforcement.
 *
 * Everything here is gated behind `cfg.moderationKey` (the
 * `x-moderator-key` request header). The surface:
 *   • case queue (auto-generated from reports/quarantines + manual flags)
 *   • player suspension / restoration (propagates to rooms, boards, invites)
 *   • temporary mutes
 *   • leaderboard rollback (invalidate one score or everything for a player)
 *   • content takedowns (ghosts, squads)
 *   • audit trail access
 */
import type { Ctx } from "../core/ctx.js";
import { HttpError } from "../util/http.js";
import type { ModerationCase } from "../types.js";

const SUSPEND_MAX_DAYS = 365;
const MUTE_MAX_HOURS = 720;

export class ModerationService {
  constructor(private ctx: Ctx) {}

  /* --------------------------------------------------------------- access */

  assertModerator(token: unknown): void {
    const key = this.ctx.cfg.moderationKey;
    if (typeof token !== "string" || token.length < 8 || token !== key) {
      throw new HttpError(403, "moderator key required", "unauthorized");
    }
  }

  /* ----------------------------------------------------------------- cases */

  list(status?: ModerationCase["status"]): ModerationCase[] {
    const all = this.ctx.db.state.moderationCases;
    const filtered = status ? all.filter((c) => c.status === status) : all;
    return [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200);
  }

  get(id: string): ModerationCase {
    const c = this.ctx.db.state.moderationCases.find((x) => x.id === id);
    if (!c) throw new HttpError(404, "case not found", "notFound");
    return c;
  }

  /** Manual flag (e.g. an operator notices something in a replay). */
  flag(byId: string, kind: string, targetId: string, reason: string): ModerationCase {
    const s = this.ctx.db.state;
    const c: ModerationCase = {
      id: `mc_${s.moderationCases.length.toString(36)}_${Math.floor(this.ctx.now()).toString(36)}`,
      kind: (kind === "ghostReport" || kind === "squadReport" || kind === "quarantinedScore" ? kind : "flaggedPlayer") as ModerationCase["kind"],
      targetId,
      byId,
      reason,
      createdAt: new Date(this.ctx.now()).toISOString(),
      status: "open",
    };
    s.moderationCases.push(c);
    if (s.moderationCases.length > 500) s.moderationCases.splice(0, s.moderationCases.length - 500);
    this.ctx.db.touch();
    this.ctx.audit.log(byId, "moderation.case_opened", c.id, { kind, targetId });
    return c;
  }

  /**
   * Decide a case. `status` is the review outcome (approved = the report
   * holds, dismissed = it doesn't); optional enforcement rides along.
   */
  resolve(
    id: string,
    byId: string,
    status: "approved" | "dismissed",
    note: string,
    action?: "suspend" | "mute" | "none",
    hours?: number,
  ): ModerationCase {
    const c = this.get(id);
    if (c.status !== "open") throw new HttpError(409, "case already decided", "closed");
    c.status = status;
    c.decidedAt = new Date(this.ctx.now()).toISOString();
    c.note = note;
    this.ctx.db.touch();

    // Enforcement side-effects (best-effort; the case still records intent).
    if (action === "suspend") {
      this.suspendPlayer(c.targetId, Math.min(SUSPEND_MAX_DAYS, Math.max(1, Math.round(hours ?? 30))), byId, note);
    } else if (action === "mute") {
      this.mutePlatform(c.targetId, Math.max(1, Math.round(hours ?? 24)), byId);
    }
    this.ctx.audit.log(byId, "moderation.case_decided", c.id, { status, action });
    return c;
  }

  /* ------------------------------------------------------------ suspension */

  suspendPlayer(playerId: string, days: number, byId: string, reason: string): void {
    const d = Math.min(SUSPEND_MAX_DAYS, Math.max(1, Math.round(days)));
    this.ctx.identity.suspend(playerId, reason.slice(0, 80) || "moderation", d);
    // Propagation: drop them from live rooms immediately.
    this.ctx.rooms.kickPlayer(playerId, "suspended");
    this.ctx.audit.log(byId, "moderation.suspended", playerId, { days: d, reason });
  }

  restorePlayer(playerId: string, byId: string): void {
    this.ctx.identity.restore(playerId);
    this.ctx.audit.log(byId, "moderation.restored", playerId);
  }

  /** Temporary platform mute (affects room emotes; squads keep local mutes). */
  mutePlatform(playerId: string, hours: number, byId: string): void {
    this.ctx.identity.mute(playerId, Math.max(1, Math.min(MUTE_MAX_HOURS, Math.round(hours))));
    this.ctx.audit.log(byId, "moderation.muted", playerId, { hours });
  }

  unmutePlatform(playerId: string, byId: string): void {
    const profile = this.ctx.db.state.profiles[playerId];
    if (!profile) throw new HttpError(404, "player not found", "notFound");
    if (profile.moderation.status === "muted") {
      profile.moderation.status = "clear";
      delete profile.moderation.expiresAt;
      delete profile.moderation.reasonCode;
      this.ctx.db.touch();
    }
    this.ctx.audit.log(byId, "moderation.unmuted", playerId);
  }

  /* ------------------------------------------------------------ rollbacks */

  /** Roll back one score (rank recalculated lazily at read time). */
  invalidateScore(byId: string, runId: string, reason: string): void {
    this.ctx.leaderboards.invalidateScore("moderator", runId, true, `${reason} (by ${byId})`);
  }

  /** Roll back every score for a player (cheater sweep). */
  invalidateAll(byId: string, playerId: string, reason: string): number {
    const n = this.ctx.leaderboards.invalidateAll(playerId, `${reason} (by ${byId})`);
    this.ctx.audit.log(byId, "moderation.scores_invalidated", playerId, { n });
    return n;
  }

  /* ------------------------------------------------------------- takedowns */

  takedownGhost(byId: string, ghostId: string, reason: string): void {
    this.ctx.ghosts.takedown(ghostId, byId, reason);
  }

  disbandSquad(byId: string, squadId: string, reason: string): void {
    this.ctx.squads.disbandByModerator(squadId, byId, reason);
  }

  /* ------------------------------------------------------------- visibility */

  auditTrail(playerId?: string, limit = 100): { at: string; actor: string; action: string; target: string; meta?: Record<string, unknown> }[] {
    const entries = this.ctx.audit.tail(limit * 3);
    const filtered = playerId ? entries.filter((e) => e.actor === playerId || e.target === playerId) : entries;
    return filtered.slice(-limit).reverse();
  }

  overview(): {
    players: number;
    suspended: number;
    muted: number;
    openCases: number;
    quarantinedScores: number;
    takenDownGhosts: number;
    saves: number;
    boards: { metric: string; active: number; quarantined: number }[];
  } {
    const s = this.ctx.db.state;
    return {
      players: Object.keys(s.profiles).length,
      suspended: Object.values(s.profiles).filter((p) => p.moderation.status === "suspended").length,
      muted: Object.values(s.profiles).filter((p) => p.moderation.status === "muted").length,
      openCases: s.moderationCases.filter((c) => c.status === "open").length,
      quarantinedScores: s.scores.filter((r) => r.status === "quarantined").length,
      takenDownGhosts: s.ghosts.filter((g) => g.status === "taken_down").length,
      saves: this.ctx.saves.count(),
      boards: [
        {
          metric: "all",
          active: s.scores.filter((r) => r.status === "active").length,
          quarantined: s.scores.filter((r) => r.status === "quarantined").length,
        },
      ],
    };
  }
}
