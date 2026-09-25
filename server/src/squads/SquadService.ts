/**
 * SquadService — clubs with real governance.
 *
 * Visibility: public (auto-join), invite (code-gated), private (approval).
 * Roles: owner / admin / member / probation. Up to a few squads per player.
 * No free-text chat — only structured emote shouts, rate-limited — by
 * design for launch.
 *
 * Weekly goal: a squad target (distance/coins/perfects) fed by verified
 * score submissions (idempotent per runId). Inactive owners (>14 days
 * without activity) lose the seat to the most recent active admin or senior
 * member (succession).
 */
import type { Ctx } from "../core/ctx.js";
import { HttpError, cleanText } from "../util/http.js";
import { makeSquadInviteCode, randomId, weekKey } from "../util/id.js";
import type { ScoreRow, Squad, SquadGoal, SquadMember, SquadRole, SquadVisibility } from "../types.js";

const CAP = 30;
const NAME_MAX = 20;
const DESC_MAX = 60;
const SHOUT_EMOTES = new Set(["👋", "", "", "🎉", "💪", "🐦", "😤", "⚡", "❤️", "🏁"]);
const SHOUT_COOLDOWN_MS = 2_000;
const CREATE_COOLDOWN_MS = 5 * 60_000;
const MAX_SQUADS_PER_PLAYER = 3;
const OWNER_INACTIVE_MS = 14 * 86_400_000;
const GOAL_REWARD_COINS = 150;

export class SquadService {
  private lastCreate = new Map<string, number>();
  private lastShout = new Map<string, number>();

  constructor(private ctx: Ctx) {}

  /* ------------------------------------------------------------- lifecycle */

  create(
    playerId: string,
    input: { name?: unknown; description?: unknown; emblem?: unknown; visibility?: unknown },
  ): Squad {
    this.ensureAllowed(playerId);
    const now = this.ctx.now();
    const last = this.lastCreate.get(playerId) ?? 0;
    if (now - last < CREATE_COOLDOWN_MS) {
      throw new HttpError(429, "one squad every 5 minutes", "cooldown", CREATE_COOLDOWN_MS - (now - last));
    }
    this.lastCreate.set(playerId, now);
    const mine = this.squadsOf(playerId);
    if (mine.length >= MAX_SQUADS_PER_PLAYER) {
      throw new HttpError(409, `a pilot may found ${MAX_SQUADS_PER_PLAYER} squads`, "tooMany");
    }
    const name = cleanText(input.name, NAME_MAX);
    if (!name) throw new HttpError(400, "name is required", "invalidName");
    const visibility: SquadVisibility =
      input.visibility === "invite" || input.visibility === "private" ? input.visibility : "public";
    const profile = this.ctx.identity.requireProfile(playerId);
    const squad: Squad = {
      id: randomId("sq"),
      name,
      description: cleanText(input.description, DESC_MAX),
      emblem: cleanText(input.emblem, 8) || "🐦",
      visibility,
      inviteCode: makeSquadInviteCode(),
      ownerId: playerId,
      createdAt: new Date(now).toISOString(),
      members: [
        {
          playerId,
          name: profile.displayName,
          role: "owner",
          joinedAt: new Date(now).toISOString(),
          lastActiveAt: new Date(now).toISOString(),
          contribution: 0,
          mutedUntil: null,
          probationUntil: null,
        },
      ],
      cap: CAP,
      pending: {},
      blocked: [],
      goal: null,
      eventTournaments: [],
      shouts: [],
      reports: [],
      contributionLedger: {},
    };
    this.ctx.db.state.squads[squad.id] = squad;
    this.ctx.db.touch();
    this.ctx.audit.log(playerId, "squad.created", squad.id, { name, visibility });
    return squad;
  }

  disband(playerId: string, squadId: string): void {
    const s = this.require(squadId);
    this.requireRole(playerId, s, "owner");
    delete this.ctx.db.state.squads[squadId];
    this.ctx.db.touch();
    this.ctx.audit.log(playerId, "squad.disbanded", squadId);
  }

  leave(playerId: string, squadId: string): void {
    const s = this.require(squadId);
    const member = s.members.find((m) => m.playerId === playerId);
    if (!member) throw new HttpError(404, "not a member", "notMember");
    if (member.role === "owner") throw new HttpError(409, "owners must disband or wait for succession", "owner");
    this.removeMember(s, playerId);
    this.ctx.db.touch();
    this.ctx.audit.log(playerId, "squad.left", squadId);
  }

  /* ------------------------------------------------------------- join flow */

  join(playerId: string, squadId: string, input: { code?: unknown } = {}): { status: "joined" | "pending" } {
    this.ensureAllowed(playerId);
    const s = this.require(squadId);
    if (s.members.some((m) => m.playerId === playerId)) throw new HttpError(409, "already a member", "alreadyMember");
    if (s.pending[playerId]) return { status: "pending" };
    if (s.blocked.includes(playerId)) throw new HttpError(403, "not welcome here", "blocked");
    if (s.members.length >= s.cap) throw new HttpError(409, "squad is full", "full");

    if (s.visibility === "public") {
      this.addMember(s, playerId, "member");
      return { status: "joined" };
    }
    if (s.visibility === "invite") {
      const code = typeof input.code === "string" ? input.code.trim().toUpperCase() : "";
      if (code !== s.inviteCode) throw new HttpError(403, "invite code required", "inviteRequired");
      this.addMember(s, playerId, "probation");
      return { status: "joined" };
    }
    // Private: queue for approval.
    s.pending[playerId] = new Date(this.ctx.now()).toISOString();
    this.ctx.db.touch();
    this.ctx.audit.log(playerId, "squad.join_requested", squadId);
    return { status: "pending" };
  }

  listApprovals(playerId: string, squadId: string): { playerId: string; name: string; at: string }[] {
    const s = this.require(squadId);
    this.requireRole(playerId, s, "admin");
    return Object.entries(s.pending).map(([pid, at]) => {
      const profile = this.ctx.db.state.profiles[pid];
      return { playerId: pid, name: profile ? profile.displayName : "Pilot", at };
    });
  }

  approve(playerId: string, squadId: string, targetId: string): void {
    const s = this.require(squadId);
    this.requireRole(playerId, s, "admin");
    if (!s.pending[targetId]) throw new HttpError(404, "no pending request", "notPending");
    if (s.members.length >= s.cap) throw new HttpError(409, "squad is full", "full");
    delete s.pending[targetId];
    this.addMember(s, targetId, "probation");
    this.ctx.audit.log(playerId, "squad.join_approved", targetId);
  }

  reject(playerId: string, squadId: string, targetId: string): void {
    const s = this.require(squadId);
    this.requireRole(playerId, s, "admin");
    if (!s.pending[targetId]) throw new HttpError(404, "no pending request", "notPending");
    delete s.pending[targetId];
    this.ctx.db.touch();
    this.ctx.audit.log(playerId, "squad.join_rejected", targetId);
  }

  /* ----------------------------------------------------------------- roles */

  setRole(actorId: string, squadId: string, targetId: string, role: SquadRole): void {
    const s = this.require(squadId);
    const actor = this.member(s, actorId);
    const adminLiftsProbation =
      actor.role === "admin" && role === "member" && this.member(s, targetId).role === "probation";
    if (actor.role !== "owner" && !adminLiftsProbation) {
      throw new HttpError(403, "only the owner changes roles (admins lift probation)", "forbidden");
    }
    if (role === "owner") throw new HttpError(403, "ownership transfers by succession only", "forbidden");
    if (role === "admin" && actor.role !== "owner") throw new HttpError(403, "only the owner appoints admins", "forbidden");
    const target = this.member(s, targetId);
    target.role = role;
    target.probationUntil =
      role === "probation" ? new Date(this.ctx.now() + 7 * 86_400_000).toISOString() : null;
    this.ctx.db.touch();
    this.ctx.audit.log(actorId, "squad.role_changed", targetId, { role });
  }

  kick(actorId: string, squadId: string, targetId: string): void {
    const s = this.require(squadId);
    const actor = this.member(s, actorId);
    const target = this.member(s, targetId);
    if (actor.role === "owner") {
      if (target.role === "owner") throw new HttpError(409, "owners disband, they are not kicked", "owner");
    } else if (actor.role !== "admin" || target.role !== "probation") {
      throw new HttpError(403, "admins may only remove probation members", "forbidden");
    }
    this.removeMember(s, targetId);
    this.ctx.db.touch();
    this.ctx.audit.log(actorId, "squad.kicked", targetId);
  }

  /** Mute from structured shouts (no free text to abuse). */
  mute(actorId: string, squadId: string, targetId: string, hours: number): void {
    const s = this.require(squadId);
    this.requireRole(actorId, s, "admin");
    this.member(s, targetId).mutedUntil = new Date(
      this.ctx.now() + Math.max(1, Math.min(168, Math.round(hours) || 24)) * 3_600_000,
    ).toISOString();
    this.ctx.db.touch();
    this.ctx.audit.log(actorId, "squad.muted", targetId, { hours });
  }

  unmute(actorId: string, squadId: string, targetId: string): void {
    const s = this.require(squadId);
    this.requireRole(actorId, s, "admin");
    this.member(s, targetId).mutedUntil = null;
    this.ctx.db.touch();
    this.ctx.audit.log(actorId, "squad.unmuted", targetId);
  }

  blockJoiner(actorId: string, squadId: string, targetId: string): void {
    const s = this.require(squadId);
    this.requireRole(actorId, s, "admin");
    if (!s.blocked.includes(targetId)) s.blocked.push(targetId);
    delete s.pending[targetId];
    this.ctx.db.touch();
    this.ctx.audit.log(actorId, "squad.blocked_joiner", targetId);
  }

  unblockJoiner(actorId: string, squadId: string, targetId: string): void {
    const s = this.require(squadId);
    this.requireRole(actorId, s, "admin");
    s.blocked = s.blocked.filter((id) => id !== targetId);
    this.ctx.db.touch();
  }

  reportSquad(playerId: string, squadId: string, reason: string): void {
    const s = this.require(squadId);
    if (!s.reports.some((r) => r.byId === playerId)) {
      s.reports.push({ byId: playerId, reason: cleanText(reason, 80) || "unspecified", at: new Date(this.ctx.now()).toISOString() });
    }
    const st = this.ctx.db.state;
    const open = st.moderationCases.some((c) => c.kind === "squadReport" && c.targetId === squadId && c.status === "open");
    if (!open) {
      st.moderationCases.push({
        id: `mc_${st.moderationCases.length.toString(36)}_${Math.floor(this.ctx.now()).toString(36)}`,
        kind: "squadReport",
        targetId: squadId,
        byId: playerId,
        reason: cleanText(reason, 80) || "reported",
        createdAt: new Date(this.ctx.now()).toISOString(),
        status: "open",
      });
    }
    this.ctx.db.touch();
  }

  /** Admin disband (moderation action). */
  disbandByModerator(squadId: string, byId: string, reason: string): void {
    if (!this.ctx.db.state.squads[squadId]) throw new HttpError(404, "squad not found", "notFound");
    delete this.ctx.db.state.squads[squadId];
    this.ctx.db.touch();
    this.ctx.audit.log(byId, "squad.disbanded_by_moderation", squadId, { reason });
  }

  /* ------------------------------------------------------------------ shout */

  /** Structured emote shout — the anti-spam-safe replacement for free chat. */
  shout(playerId: string, squadId: string, emote: string): Squad["shouts"][number] {
    const s = this.require(squadId);
    const member = this.member(s, playerId);
    if (member.mutedUntil && this.ctx.now() < Date.parse(member.mutedUntil)) {
      throw new HttpError(403, "muted in this squad", "muted");
    }
    if (!SHOUT_EMOTES.has(emote)) throw new HttpError(400, "unknown emote", "invalidEmote");
    const now = this.ctx.now();
    const last = this.lastShout.get(playerId) ?? 0;
    if (now - last < SHOUT_COOLDOWN_MS) throw new HttpError(429, "slow down", "cooldown", SHOUT_COOLDOWN_MS - (now - last));
    this.lastShout.set(playerId, now);
    const entry = { byId: playerId, byName: member.name, emote, at: new Date(now).toISOString() };
    s.shouts.push(entry);
    if (s.shouts.length > 50) s.shouts.splice(0, s.shouts.length - 50);
    this.touchMember(s, playerId);
    this.ctx.db.touch();
    return entry;
  }

  /* ------------------------------------------------------------------ goal */

  /** Weekly goal: deterministic per squad+week so every client agrees. */
  goal(playerId: string, squadId: string): SquadGoal {
    const s = this.require(squadId);
    const wk = weekKey(this.ctx.now());
    if (!s.goal || s.goal.weekKey !== wk) {
      // Deterministic target from the squad id so the whole squad sees the
      // same number without a race to write it first.
      let h = 0;
      for (const ch of `${s.id}:${wk}`) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
      const kinds: SquadGoal["kind"][] = ["total_distance", "total_coins", "total_perfects"];
      s.goal = {
        weekKey: wk,
        kind: kinds[h % kinds.length]!,
        target: 5000 + (h % 40) * 1000,
        progress: 0,
        claimedAt: null,
      };
      this.ctx.db.touch();
    }
    void playerId;
    return s.goal;
  }

  claimGoal(playerId: string, squadId: string): { reward: number } {
    const s = this.require(squadId);
    this.member(s, playerId); // membership check
    const g = this.goal(playerId, squadId);
    if (g.claimedAt) throw new HttpError(409, "goal already claimed", "alreadyClaimed");
    if (g.progress < g.target) throw new HttpError(409, "goal not met", "notMet");
    g.claimedAt = new Date(this.ctx.now()).toISOString();
    this.ctx.db.touch();
    this.ctx.audit.log(playerId, "squad.goal_claimed", squadId, { target: g.target });
    return { reward: GOAL_REWARD_COINS };
  }

  /**
   * Contribution hook from the leaderboard: verified score submissions feed
   * the squad goal. Idempotent per runId (the ledger).
   */
  recordContribution(playerId: string, row: ScoreRow): void {
    const s = this.squadsOf(playerId)[0];
    if (!s) return;
    if (s.contributionLedger[row.runId]) return;
    s.contributionLedger[row.runId] = new Date(this.ctx.now()).toISOString();
    const keys = Object.keys(s.contributionLedger);
    if (keys.length > 500) {
      for (const k of keys.sort().slice(0, keys.length - 500)) delete s.contributionLedger[k];
    }
    this.touchMember(s, playerId);
    const g = this.goal(playerId, s.id);
    const amount = g.kind === "total_distance" ? row.distance : g.kind === "total_coins" ? row.coins : row.perfects;
    g.progress = Math.round(Math.min(g.target * 10, g.progress + Math.round(amount)));
    const member = s.members.find((m) => m.playerId === playerId);
    if (member) member.contribution += Math.round(amount);
    this.ctx.db.touch();
  }

  /** Event participation: called when a member registers for a tournament. */
  noteEvent(playerId: string, tournamentId: string): void {
    const s = this.squadsOf(playerId)[0];
    if (!s || s.eventTournaments.includes(tournamentId)) return;
    s.eventTournaments.push(tournamentId);
    if (s.eventTournaments.length > 50) s.eventTournaments.shift();
    this.ctx.db.touch();
  }

  /**
   * Inactive-owner succession: if the owner has been silent for 14+ days,
   * the most recent active admin (else senior member) inherits.
   */
  sweepSuccession(): { squadId: string; from: string; to: string }[] {
    const out: { squadId: string; from: string; to: string }[] = [];
    const now = this.ctx.now();
    for (const s of Object.values(this.ctx.db.state.squads)) {
      const owner = s.members.find((m) => m.playerId === s.ownerId);
      if (!owner) continue;
      if (now - Date.parse(owner.lastActiveAt) < OWNER_INACTIVE_MS) continue;
      const candidates = s.members
        .filter((m) => m.playerId !== s.ownerId && !m.probationUntil)
        .sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt) || a.joinedAt.localeCompare(b.joinedAt));
      const next = candidates[0];
      if (!next) continue;
      const old = s.ownerId;
      owner.role = "member";
      next.role = "owner";
      s.ownerId = next.playerId;
      this.ctx.db.touch();
      this.ctx.audit.log("system", "squad.owner_succession", s.id, { from: old, to: next.playerId });
      out.push({ squadId: s.id, from: old, to: next.playerId });
    }
    return out;
  }

  /** Lazy probation expiry (probation lapses after 7 days → member). */
  sweepProbation(): number {
    const now = this.ctx.now();
    let n = 0;
    for (const s of Object.values(this.ctx.db.state.squads)) {
      for (const m of s.members) {
        if (m.probationUntil && now > Date.parse(m.probationUntil)) {
          m.probationUntil = null;
          if (m.role === "probation") m.role = "member";
          n++;
        }
      }
    }
    if (n > 0) this.ctx.db.touch();
    return n;
  }

  /* ------------------------------------------------------------------ view */

  squadsOf(playerId: string): Squad[] {
    return Object.values(this.ctx.db.state.squads).filter((s) => s.members.some((m) => m.playerId === playerId));
  }

  get(
    playerId: string,
    squadId: string,
  ): {
    squad: Squad;
    leaderboard: { playerId: string; name: string; distance: number; contribution: number }[];
    goal: SquadGoal;
    events: string[];
  } {
    const s = this.require(squadId);
    const member = s.members.find((m) => m.playerId === playerId);
    if (!member && s.visibility !== "public") throw new HttpError(403, "not a member", "notMember");
    const leaderboard = s.members
      .map((m) => ({
        playerId: m.playerId,
        name: m.name,
        distance: this.ctx.leaderboards.bestDistanceFor(m.playerId),
        contribution: m.contribution,
      }))
      .sort((a, b) => b.distance - a.distance || b.contribution - a.contribution)
      .slice(0, 10);
    return { squad: s, leaderboard, goal: this.goal(playerId, squadId), events: s.eventTournaments.slice(-10) };
  }

  /** Public browse: squads open to anyone (public visibility only). */
  browse(): { id: string; name: string; emblem: string; members: number; visibility: SquadVisibility }[] {
    return Object.values(this.ctx.db.state.squads)
      .filter((s) => s.visibility === "public")
      .sort((a, b) => b.members.length - a.members.length)
      .slice(0, 50)
      .map((s) => ({ id: s.id, name: s.name, emblem: s.emblem, members: s.members.length, visibility: s.visibility }));
  }

  /* --------------------------------------------------------------- internal */

  private require(squadId: string): Squad {
    const s = this.ctx.db.state.squads[squadId];
    if (!s) throw new HttpError(404, "squad not found", "notFound");
    return s;
  }

  private member(s: Squad, playerId: string): SquadMember {
    const m = s.members.find((x) => x.playerId === playerId);
    if (!m) throw new HttpError(404, "not a member", "notMember");
    return m;
  }

  private requireRole(playerId: string, s: Squad, min: "admin" | "owner"): void {
    const m = this.member(s, playerId);
    const rank: Record<SquadRole, number> = { member: 0, probation: 0, admin: 1, owner: 2 };
    if (rank[m.role] < rank[min]) throw new HttpError(403, "requires a higher role", "forbidden");
  }

  private addMember(s: Squad, playerId: string, role: SquadRole): void {
    const profile = this.ctx.db.state.profiles[playerId];
    s.members.push({
      playerId,
      name: profile ? profile.displayName : "Pilot",
      role,
      joinedAt: new Date(this.ctx.now()).toISOString(),
      lastActiveAt: new Date(this.ctx.now()).toISOString(),
      contribution: 0,
      mutedUntil: null,
      probationUntil: role === "probation" ? new Date(this.ctx.now() + 7 * 86_400_000).toISOString() : null,
    });
    this.ctx.db.touch();
  }

  private removeMember(s: Squad, playerId: string): void {
    s.members = s.members.filter((m) => m.playerId !== playerId);
  }

  private touchMember(s: Squad, playerId: string): void {
    const m = s.members.find((x) => x.playerId === playerId);
    if (m) m.lastActiveAt = new Date(this.ctx.now()).toISOString();
  }

  private ensureAllowed(playerId: string): void {
    if (this.ctx.identity.isSuspended(playerId)) throw new HttpError(403, "account suspended", "suspended");
  }
}
