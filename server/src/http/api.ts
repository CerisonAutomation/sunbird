/**
 * Sunbird social backend — protocol v1 REST API.
 *
 * Auth: `Authorization: Bearer <sb1 session token>` (see /identity routes).
 * Moderation: `x-moderator-key` header (cfg.moderationKey).
 * All routes are rate-limited per IP (reads/writes/guest buckets).
 */
import type { Ctx } from "../core/ctx.js";
import type { Route } from "./router.js";
import { HttpError, cleanText } from "../util/http.js";
import { seasonId } from "../util/id.js";
import type { BoardMetric, BoardScope, PrivacySettings } from "../types.js";
import type { PublishInput } from "../ghosts/GhostService.js";

const METRICS: BoardMetric[] = ["distance", "altitude", "perfects", "coins", "score"];
const SCOPES: BoardScope[] = ["global", "daily", "friends"];

function metric(q: URLSearchParams, fallback: BoardMetric = "distance"): BoardMetric {
  const v = q.get("metric") ?? "";
  return (METRICS as string[]).includes(v) ? (v as BoardMetric) : fallback;
}

function scope(q: URLSearchParams): BoardScope {
  const v = q.get("scope") ?? "global";
  return (SCOPES as string[]).includes(v) ? (v as BoardScope) : "global";
}

function hostSeatCheck(ctx: Ctx, code: string, actor: string): string {
  const session = ctx.rooms.byCode(code);
  const host = session.hostSeat;
  if (!host || host.playerId !== actor) throw new HttpError(403, "host only", "notHost");
  return host.seatId;
}

export const V1_ROUTES: Route[] = [
  /* ---------------------------------------------------------------- health */

  {
    method: "GET",
    re: /^\/health$/,
    rl: "read",
    auth: "optional",
    handler: (ctx) => {
      const storage = ctx.db.storageStatus();
      // The probe goes red (503) when the file backend is failing: a
      // degraded store must be visible to the orchestrator, not absorbed.
      if (!storage.ok) {
        throw new HttpError(503, `persistence degraded: ${storage.detail ?? "last write failed"}`, "storageDegraded");
      }
      return {
        ok: true,
        service: "sunbird-social",
        storage: storage.mode,
        rooms: ctx.rooms.sessionCount(),
        pilots: ctx.rooms.pilotCount(),
        players: Object.keys(ctx.db.state.profiles).length,
      };
    },
  },

  /* -------------------------------------------------------------- identity */

  {
    // Guest identity (idempotent per deviceId).
    method: "POST",
    re: /^\/mp\/v1\/identity\/guest$/,
    rl: "guest",
    auth: "optional",
    handler: (ctx, _p, _q, body) => {
      const deviceId = typeof body.deviceId === "string" ? body.deviceId.slice(0, 64) : "";
      const created = ctx.db.state.guestLinks[deviceId] === undefined;
      const creds = ctx.identity.createGuest({ deviceId, name: body.name, countryCode: body.countryCode });
      ctx.audit.log(creds.playerId, created ? "identity.guest_created" : "identity.guest_seen", deviceId, {});
      return { playerId: creds.playerId, token: creds.token, profile: creds.profile, created };
    },
  },
  {
    // Platform identity upgrade (CrazyGames/Steam/etc.): link or merge.
    method: "POST",
    re: /^\/mp\/v1\/identity\/platform$/,
    rl: "guest",
    auth: "optional",
    handler: (ctx, _p, _q, body) => {
      let playerId: string;
      if (typeof body.deviceId === "string" && body.deviceId) {
        playerId = ctx.identity.createGuest({ deviceId: body.deviceId, name: body.name }).playerId;
      } else {
        const existing = authFromBody(ctx, body.token);
        if (!existing) throw new HttpError(400, "deviceId or token required", "noIdentity");
        playerId = existing;
      }
      const profile = ctx.identity.upgrade(playerId, {
        platform: body.platform,
        platformId: body.platformId,
        name: body.name,
      });
      // A merge can make a DIFFERENT profile the survivor (the existing
      // portal account) — always return the survivor's identity + token.
      const token = ctx.trust.signSession(profile.playerId, ctx.now());
      return { playerId: profile.playerId, token, profile, created: false };
    },
  },
  {
    method: "GET",
    re: /^\/mp\/v1\/me$/,
    rl: "read",
    auth: "required",
    handler: (ctx, _p, _q, _b, actor) => {
      ctx.identity.touchPresence(actor);
      const profile = ctx.identity.me(actor);
      return {
        profile,
        achievements: ctx.achievements.publicSummary(actor),
        squads: ctx.squads.squadsOf(actor).map((s) => ({
          id: s.id,
          name: s.name,
          emblem: s.emblem,
          role: s.members.find((m) => m.playerId === actor)?.role ?? "member",
          members: s.members.length,
        })),
      };
    },
  },
  {
    method: "PATCH",
    re: /^\/mp\/v1\/me$/,
    rl: "write",
    auth: "required",
    handler: (ctx, _p, _q, body, actor) => {
      let profile = ctx.identity.requireProfile(actor);
      if (typeof body.displayName === "string") profile = ctx.identity.updateName(actor, body.displayName);
      if (body.privacy && typeof body.privacy === "object") {
        const pv = body.privacy as Record<string, unknown>;
        const patch: Partial<PrivacySettings> = {};
        if (typeof pv.showOnLeaderboards === "boolean") patch.showOnLeaderboards = pv.showOnLeaderboards;
        if (typeof pv.allowFriendRequests === "boolean") patch.allowFriendRequests = pv.allowFriendRequests;
        if (typeof pv.allowInvites === "boolean") patch.allowInvites = pv.allowInvites;
        if (typeof pv.showPresence === "boolean") patch.showPresence = pv.showPresence;
        if (pv.replays === "public" || pv.replays === "friends" || pv.replays === "private") patch.replays = pv.replays;
        if (Object.keys(patch).length > 0) profile = ctx.identity.updatePrivacy(actor, patch);
      }
      return { profile };
    },
  },
  {
    // Exact-code lookup only (the ONLY public identity search surface).
    method: "GET",
    re: /^\/mp\/v1\/players\/(?<ref>[A-Za-z0-9-]{4,40})$/,
    rl: "read",
    auth: "optional",
    handler: (ctx, p, _q, _b, actor) => {
      const ref = p.ref.toUpperCase();
      let profile = null;
      if (ref.startsWith("SUN-")) profile = ctx.identity.byCode(ref, actor || undefined);
      else if (ref.startsWith("P_") && ref.length <= 32) profile = ctx.identity.publicView(ref, actor || undefined);
      if (!profile) throw new HttpError(404, "no pilot with that code", "notFound");
      return { profile };
    },
  },

  /* --------------------------------------------------------------- friends */

  {
    method: "POST",
    re: /^\/mp\/v1\/friends\/request$/,
    rl: "write",
    auth: "required",
    handler: (ctx, _p, _q, body, actor) => {
      const req = ctx.friends.sendRequest(actor, cleanText(body.code, 16).toUpperCase());
      return { requestId: req.id, status: req.status };
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/friends\/respond$/,
    rl: "write",
    auth: "required",
    handler: (ctx, _p, _q, body, actor) => {
      const accept = body.accept === true;
      return ctx.friends.respond(actor, String(body.requestId ?? ""), accept);
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/friends\/cancel$/,
    rl: "write",
    auth: "required",
    handler: (ctx, _p, _q, body, actor) => {
      const req = ctx.friends.cancelRequest(actor, String(body.requestId ?? ""));
      return { requestId: req.id, status: req.status };
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/friends\/remove$/,
    rl: "write",
    auth: "required",
    handler: (ctx, _p, _q, body, actor) => {
      ctx.friends.removeFriend(actor, String(body.playerId ?? ""));
      return { removed: true };
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/friends\/block$/,
    rl: "write",
    auth: "required",
    handler: (ctx, _p, _q, body, actor) => {
      ctx.friends.block(actor, cleanText(body.code, 16).toUpperCase());
      return { blocked: true };
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/friends\/unblock$/,
    rl: "write",
    auth: "required",
    handler: (ctx, _p, _q, body, actor) => {
      ctx.friends.unblock(actor, String(body.playerId ?? ""));
      return { unblocked: true };
    },
  },
  {
    method: "GET",
    re: /^\/mp\/v1\/friends$/,
    rl: "read",
    auth: "required",
    handler: (ctx, _p, _q, _b, actor) => ({
      friends: ctx.friends.listFriends(actor),
      pendingIn: ctx.friends.listPending(actor),
      pendingOut: ctx.friends.listOutgoing(actor),
    }),
  },
  {
    method: "GET",
    re: /^\/mp\/v1\/friends\/check\/(?<id>p_[a-f0-9]{24})$/,
    rl: "read",
    auth: "required",
    handler: (ctx, p, _q, _b, actor) => ctx.friends.canInvite(actor, p.id),
  },
  {
    method: "GET",
    re: /^\/mp\/v1\/friends\/(?<id>p_[a-f0-9]{24})$/,
    rl: "read",
    auth: "required",
    handler: (ctx, p, _q, _b, actor) => {
      const friend = ctx.friends.listFriends(actor).find((f) => f.playerId === p.id);
      if (!friend) throw new HttpError(404, "not a friend", "notFriend");
      return {
        friend,
        invite: ctx.friends.canInvite(actor, p.id),
        bestDistance: ctx.leaderboards.bestDistanceFor(p.id),
      };
    },
  },

  /* ----------------------------------------------------------------- rooms */

  {
    method: "POST",
    re: /^\/mp\/v1\/rooms\/matchmake$/,
    rl: "write",
    auth: "required",
    handler: (ctx, _p, _q, body, actor) => {
      const profile = ctx.identity.requireProfile(actor);
      const { room, grant } = ctx.rooms.matchmake({
        playerId: actor,
        name: body.name ?? profile.displayName,
        skin: body.skin,
        hue: body.hue,
        seed: body.seed,
      });
      return { room, grant };
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/rooms$/,
    rl: "write",
    auth: "required",
    handler: (ctx, _p, _q, body, actor) => {
      const profile = ctx.identity.requireProfile(actor);
      const { room, grant } = ctx.rooms.create({
        playerId: actor,
        name: body.name ?? profile.displayName,
        skin: body.skin,
        hue: body.hue,
        seed: body.seed,
      });
      return { room, grant };
    },
  },
  {
    method: "GET",
    re: /^\/mp\/v1\/rooms$/,
    rl: "read",
    auth: "optional",
    handler: (ctx, _p, q) => ({ rooms: ctx.rooms.browse(Number(q.get("limit")) || 40) }),
  },
  {
    method: "GET",
    re: /^\/mp\/v1\/rooms\/(?<code>[A-Z0-9]{5})$/,
    rl: "read",
    auth: "optional",
    handler: (ctx, p, _q, _b, actor) => ({ room: ctx.rooms.get(p.code, actor || undefined) }),
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/rooms\/(?<code>[A-Z0-9]{5})\/join$/,
    rl: "write",
    auth: "required",
    handler: (ctx, p, _q, body, actor) => {
      const profile = ctx.identity.requireProfile(actor);
      const grant = ctx.rooms.join(p.code, {
        playerId: actor,
        name: body.name ?? profile.displayName,
        skin: body.skin,
        hue: body.hue,
      });
      return { grant };
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/rooms\/(?<code>[A-Z0-9]{5})\/reconnect$/,
    rl: "write",
    auth: "required",
    handler: (ctx, p, _q, body, actor) => {
      const grant = ctx.rooms.reconnect(p.code, {
        playerId: actor,
        seatId: body.seatId,
        reconnectToken: body.reconnectToken,
      });
      return { grant };
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/rooms\/(?<code>[A-Z0-9]{5})\/leave$/,
    rl: "write",
    auth: "required",
    handler: (ctx, p, _q, _b, actor) => {
      ctx.rooms.leave(p.code, actor);
      return undefined;
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/rooms\/(?<code>[A-Z0-9]{5})\/start$/,
    rl: "write",
    auth: "required",
    handler: (ctx, p, _q, _b, actor) => {
      const seatId = hostSeatCheck(ctx, p.code, actor);
      return { room: ctx.rooms.start(p.code, seatId) };
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/rooms\/(?<code>[A-Z0-9]{5})\/cancel$/,
    rl: "write",
    auth: "required",
    handler: (ctx, p, _q, _b, actor) => {
      const seatId = hostSeatCheck(ctx, p.code, actor);
      return { room: ctx.rooms.cancel(p.code, seatId) };
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/rooms\/(?<code>[A-Z0-9]{5})\/kick$/,
    rl: "write",
    auth: "required",
    handler: (ctx, p, _q, body, actor) => {
      const session = ctx.rooms.byCode(p.code);
      if (session.hostSeat?.playerId !== actor) throw new HttpError(403, "host only", "notHost");
      const target = String(body.playerId ?? "");
      const victim = session.seatsForPlayer(target);
      if (!victim) throw new HttpError(404, "no such seat", "notFound");
      session.leave(victim.seatId);
      ctx.audit.log(actor, "room.kicked", target, { room: p.code });
      return undefined;
    },
  },
  {
    // Authoritative race result — requires the short-lived match token.
    method: "POST",
    re: /^\/mp\/v1\/rooms\/(?<code>[A-Z0-9]{5})\/result$/,
    rl: "write",
    auth: "required",
    handler: (ctx, p, _q, body, actor) => {
      return { result: ctx.rooms.submitResult(p.code, actor, { matchToken: body.matchToken, runId: body.runId, seed: body.seed }) };
    },
  },

  /* ----------------------------------------------------------- leaderboards */

  {
    method: "POST",
    re: /^\/mp\/v1\/scores$/,
    rl: "write",
    auth: "required",
    handler: (ctx, _p, _q, body, actor) => {
      const profile = ctx.identity.requireProfile(actor);
      const out = ctx.leaderboards.submit(actor, {
        runId: body.runId,
        name: body.name ?? profile.displayName,
        skin: body.skin,
        distance: body.distance,
        altitude: body.altitude,
        perfects: body.perfects,
        coins: body.coins,
        score: body.score,
        durationMs: body.durationMs,
        seed: body.seed,
        mode: body.mode,
        date: body.date,
      });
      if (out.status === "quarantined") {
        return { status: out.status, runId: out.runId, quarantinedReason: out.quarantinedReason };
      }
      return out;
    },
  },
  {
    method: "GET",
    re: /^\/mp\/v1\/leaderboard$/,
    rl: "read",
    auth: "optional",
    handler: (ctx, _p, q, _b, actor) => {
      return ctx.leaderboards.get(scope(q), metric(q), {
        viewerId: actor || undefined,
        limit: Number(q.get("limit")) || undefined,
        cursor: q.get("cursor") ?? undefined,
        seasonId: q.get("season") ?? undefined,
      });
    },
  },
  {
    method: "GET",
    re: /^\/mp\/v1\/leaderboard\/around-me$/,
    rl: "read",
    auth: "required",
    handler: (ctx, _p, q, _b, actor) => ctx.leaderboards.aroundMe(actor, scope(q), metric(q)),
  },
  {
    method: "GET",
    re: /^\/mp\/v1\/seasons$/,
    rl: "read",
    auth: "optional",
    handler: (ctx) => ({
      current: seasonId(ctx.now()),
      snapshots: ctx.leaderboards.seasons(),
    }),
  },
  {
    method: "GET",
    re: /^\/mp\/v1\/seasons\/(?<id>\d{4}-\d{2})$/,
    rl: "read",
    auth: "optional",
    handler: (ctx, p) => {
      const snap = ctx.leaderboards.season(p.id);
      if (!snap) throw new HttpError(404, "season not found", "notFound");
      return { snapshot: snap };
    },
  },

  /* ---------------------------------------------------------------- ghosts */

  {
    method: "POST",
    re: /^\/mp\/v1\/ghosts$/,
    rl: "write",
    auth: "required",
    bodyMaxBytes: 256 * 1024,
    handler: (ctx, _p, _q, body, actor) => ctx.ghosts.publish(actor, body as unknown as PublishInput),
  },
  {
    method: "GET",
    re: /^\/mp\/v1\/ghosts\/rival$/,
    rl: "read",
    auth: "required",
    handler: async (ctx, _p, q, _b, actor) => {
      const record = await ctx.ghosts.rival(cleanText(q.get("seed"), 64), actor, Number(q.get("near")) || 0);
      return { ghost: record };
    },
  },
  {
    method: "GET",
    re: /^\/mp\/v1\/ghosts\/featured$/,
    rl: "read",
    auth: "optional",
    handler: (ctx, _p, q) => ({ ghosts: ctx.ghosts.featured(cleanText(q.get("seed"), 64)) }),
  },
  {
    method: "GET",
    re: /^\/mp\/v1\/ghosts\/(?<id>[a-z0-9_-]{6,64})\/challenge$/,
    rl: "read",
    auth: "optional",
    handler: (ctx, p) => ({ url: ctx.ghosts.challengeUrl(p.id) }),
  },
  {
    method: "GET",
    re: /^\/mp\/v1\/ghosts\/(?<id>[a-z0-9_-]{6,64})$/,
    rl: "read",
    auth: "optional",
    handler: async (ctx, p, _q, _b, actor) => ({ ghost: await ctx.ghosts.fetch(p.id, actor || undefined) }),
  },
  {
    method: "GET",
    re: /^\/mp\/v1\/ghosts$/,
    rl: "read",
    auth: "optional",
    handler: (ctx, _p, q) => ({ ghosts: ctx.ghosts.list(cleanText(q.get("seed"), 64), Number(q.get("limit")) || 20) }),
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/ghosts\/(?<id>[a-z0-9_-]{6,64})\/report$/,
    rl: "write",
    auth: "required",
    handler: (ctx, p, _q, body, actor) => ctx.ghosts.report(p.id, actor, cleanText(body.reason, 80)),
  },
  {
    method: "DELETE",
    re: /^\/mp\/v1\/ghosts\/(?<id>[a-z0-9_-]{6,64})$/,
    rl: "write",
    auth: "required",
    handler: (ctx, p, _q, _b, actor) => {
      ctx.ghosts.remove(p.id, actor);
      return { removed: true };
    },
  },

  /* ----------------------------------------------------------- tournaments */

  {
    method: "GET",
    re: /^\/mp\/v1\/tournaments\/active$/,
    rl: "read",
    auth: "optional",
    handler: (ctx) => ({ tournaments: ctx.tournaments.active() }),
  },
  {
    method: "GET",
    re: /^\/mp\/v1\/tournaments\/(?<id>[a-z0-9_-]{4,40})\/standings$/,
    rl: "read",
    auth: "optional",
    handler: (ctx, p, _q, _b, actor) => ({ standings: ctx.tournaments.standings(p.id, actor || undefined) }),
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/tournaments\/(?<id>[a-z0-9_-]{4,40})\/register$/,
    rl: "write",
    auth: "required",
    handler: (ctx, p, _q, _b, actor) => ({ tournament: ctx.tournaments.register(p.id, actor) }),
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/tournaments\/(?<id>[a-z0-9_-]{4,40})\/result$/,
    rl: "write",
    auth: "required",
    handler: (ctx, p, _q, body, actor) => ctx.tournaments.submitResult(p.id, actor, body),
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/tournaments\/(?<id>[a-z0-9_-]{4,40})\/claim$/,
    rl: "write",
    auth: "required",
    handler: (ctx, p, _q, _b, actor) => {
      const grant = ctx.tournaments.claimReward(p.id, actor);
      return { granted: grant !== null, grant: grant ?? undefined };
    },
  },
  {
    method: "GET",
    re: /^\/mp\/v1\/tournaments\/(?<id>[a-z0-9_-]{4,40})$/,
    rl: "read",
    auth: "optional",
    handler: (ctx, p, _q, _b, actor) => ({ tournament: ctx.tournaments.view(p.id, actor || undefined) }),
  },
  {
    method: "GET",
    re: /^\/mp\/v1\/tournaments$/,
    rl: "read",
    auth: "optional",
    handler: (ctx, _p, q) => {
      const phase = q.get("phase") as "draft" | "registration" | "active" | "finished" | "canceled" | null;
      return { tournaments: ctx.tournaments.list(phase ?? undefined) };
    },
  },
  {
    // Season leaderboards for a season (client season screen).
    method: "GET",
    re: /^\/mp\/v1\/seasons\/(?<id>\d{4}-\d{2})\/tournaments$/,
    rl: "read",
    auth: "optional",
    handler: (ctx, p, _q, _b, actor) => ({ seasons: ctx.tournaments.seasonLeaderboard(p.id, actor || undefined) }),
  },
  /* tournament moderation (moderator key) */
  {
    method: "POST",
    re: /^\/mp\/v1\/tournaments$/,
    rl: "write",
    auth: "mod",
    handler: (ctx, _p, _q, body, actor) => ({ tournament: ctx.tournaments.create(body), created: true, actor }),
  },
  ...(["openRegistration", "closeRegistration", "start", "finish", "cancel"] as const).map((fn) => ({
    method: "POST" as const,
    re: new RegExp(`^\\/mp\\/v1\\/tournaments\\/(?<id>[a-z0-9_-]{4,40})\\/${fn === "openRegistration" ? "open" : fn === "closeRegistration" ? "close" : fn}$`),
    rl: "write" as const,
    auth: "mod" as const,
    handler: (ctx: Ctx, p: Record<string, string>, _q: URLSearchParams, _b: Record<string, unknown>, actor: string) => {
      const t = ctx.tournaments[fn](p.id);
      ctx.audit.log(actor, `tournament.${fn}`, p.id, {});
      return { tournament: t };
    },
  })),
  {
    method: "POST",
    re: /^\/mp\/v1\/tournaments\/(?<id>[a-z0-9_-]{4,40})\/distribute$/,
    rl: "write",
    auth: "mod",
    handler: (ctx, p, _q, _b, actor) => ctx.tournaments.distributeRewards(p.id, actor),
  },

  /* ---------------------------------------------------------------- squads */

  {
    method: "GET",
    re: /^\/mp\/v1\/squads\/browse$/,
    rl: "read",
    auth: "optional",
    handler: (ctx) => ({ squads: ctx.squads.browse() }),
  },
  {
    method: "GET",
    re: /^\/mp\/v1\/squads\/(?<id>[a-z0-9_-]{4,40})\/approvals$/,
    rl: "read",
    auth: "required",
    handler: (ctx, p, _q, _b, actor) => ({ approvals: ctx.squads.listApprovals(actor, p.id) }),
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/squads\/(?<id>[a-z0-9_-]{4,40})\/approve$/,
    rl: "write",
    auth: "required",
    handler: (ctx, p, _q, body, actor) => {
      ctx.squads.approve(actor, p.id, String(body.targetId ?? ""));
      return { approved: true };
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/squads\/(?<id>[a-z0-9_-]{4,40})\/reject$/,
    rl: "write",
    auth: "required",
    handler: (ctx, p, _q, body, actor) => {
      ctx.squads.reject(actor, p.id, String(body.targetId ?? ""));
      return { rejected: true };
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/squads\/(?<id>[a-z0-9_-]{4,40})\/role$/,
    rl: "write",
    auth: "required",
    handler: (ctx, p, _q, body, actor) => {
      const role = String(body.role ?? "");
      if (!["admin", "member", "probation"].includes(role)) throw new HttpError(400, "bad role", "invalidRole");
      ctx.squads.setRole(actor, p.id, String(body.targetId ?? ""), role as never);
      return { updated: true };
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/squads\/(?<id>[a-z0-9_-]{4,40})\/kick$/,
    rl: "write",
    auth: "required",
    handler: (ctx, p, _q, body, actor) => {
      ctx.squads.kick(actor, p.id, String(body.targetId ?? ""));
      return { kicked: true };
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/squads\/(?<id>[a-z0-9_-]{4,40})\/mute$/,
    rl: "write",
    auth: "required",
    handler: (ctx, p, _q, body, actor) => {
      ctx.squads.mute(actor, p.id, String(body.targetId ?? ""), Number(body.hours) || 24);
      return { muted: true };
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/squads\/(?<id>[a-z0-9_-]{4,40})\/unmute$/,
    rl: "write",
    auth: "required",
    handler: (ctx, p, _q, body, actor) => {
      ctx.squads.unmute(actor, p.id, String(body.targetId ?? ""));
      return { unmuted: true };
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/squads\/(?<id>[a-z0-9_-]{4,40})\/block$/,
    rl: "write",
    auth: "required",
    handler: (ctx, p, _q, body, actor) => {
      ctx.squads.blockJoiner(actor, p.id, String(body.targetId ?? ""));
      return { blocked: true };
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/squads\/(?<id>[a-z0-9_-]{4,40})\/unblock$/,
    rl: "write",
    auth: "required",
    handler: (ctx, p, _q, body, actor) => {
      ctx.squads.unblockJoiner(actor, p.id, String(body.targetId ?? ""));
      return { unblocked: true };
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/squads\/(?<id>[a-z0-9_-]{4,40})\/report$/,
    rl: "write",
    auth: "required",
    handler: (ctx, p, _q, body, actor) => {
      ctx.squads.reportSquad(actor, p.id, cleanText(body.reason, 80));
      return { reported: true };
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/squads\/(?<id>[a-z0-9_-]{4,40})\/shout$/,
    rl: "write",
    auth: "required",
    handler: (ctx, p, _q, body, actor) => ({ shout: ctx.squads.shout(actor, p.id, cleanText(body.emote, 8)) }),
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/squads\/(?<id>[a-z0-9_-]{4,40})\/goal\/claim$/,
    rl: "write",
    auth: "required",
    handler: (ctx, p, _q, _b, actor) => ctx.squads.claimGoal(actor, p.id),
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/squads\/(?<id>[a-z0-9_-]{4,40})\/join$/,
    rl: "write",
    auth: "required",
    handler: (ctx, p, _q, body, actor) => ctx.squads.join(actor, p.id, { code: body.code }),
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/squads\/(?<id>[a-z0-9_-]{4,40})\/leave$/,
    rl: "write",
    auth: "required",
    handler: (ctx, p, _q, _b, actor) => {
      ctx.squads.leave(actor, p.id);
      return { left: true };
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/squads\/(?<id>[a-z0-9_-]{4,40})\/disband$/,
    rl: "write",
    auth: "required",
    handler: (ctx, p, _q, _b, actor) => {
      ctx.squads.disband(actor, p.id);
      return { disbanded: true };
    },
  },
  {
    method: "GET",
    re: /^\/mp\/v1\/squads\/(?<id>[a-z0-9_-]{4,40})$/,
    rl: "read",
    auth: "optional",
    handler: (ctx, p, _q, _b, actor) => ctx.squads.get(actor || "anon", p.id),
  },
  {
    method: "GET",
    re: /^\/mp\/v1\/squads$/,
    rl: "read",
    auth: "required",
    handler: (ctx, _p, _q, _b, actor) => ({ squads: ctx.squads.squadsOf(actor).map((s) => ctx.squads.get(actor, s.id)) }),
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/squads$/,
    rl: "write",
    auth: "required",
    handler: (ctx, _p, _q, body, actor) => ({ squad: ctx.squads.create(actor, body) }),
  },

  /* ---------------------------------------------------------- achievements */

  {
    method: "POST",
    re: /^\/mp\/v1\/achievements\/report$/,
    rl: "write",
    auth: "required",
    handler: (ctx, _p, _q, body, actor) => ctx.achievements.verify(actor, body),
  },
  {
    method: "GET",
    re: /^\/mp\/v1\/achievements$/,
    rl: "read",
    auth: "required",
    handler: (ctx, _p, q, _b, actor) => ({ progress: ctx.achievements.progress(actor, q.get("season") ?? undefined) }),
  },

  /* ----------------------------------------------------------------- saves */

  {
    method: "GET",
    re: /^\/mp\/v1\/saves$/,
    rl: "read",
    auth: "required",
    handler: (ctx, _p, _q, _b, actor) => ({ save: ctx.saves.load(actor) }),
  },
  {
    method: "PUT",
    re: /^\/mp\/v1\/saves$/,
    rl: "write",
    auth: "required",
    bodyMaxBytes: 65_536,
    handler: (ctx, _p, _q, body, actor) =>
      ctx.saves.put(actor, body as { payload: unknown; baseVersion?: unknown; updatedAt?: unknown }),
  },

  /* ------------------------------------------------------------- moderation */

  {
    method: "GET",
    re: /^\/mp\/v1\/moderation\/overview$/,
    rl: "read",
    auth: "mod",
    handler: (ctx) => ctx.moderation.overview(),
  },
  {
    method: "GET",
    re: /^\/mp\/v1\/moderation\/audit$/,
    rl: "read",
    auth: "mod",
    handler: (ctx, _p, q) => ({
      entries: ctx.moderation.auditTrail(q.get("playerId") ?? undefined, Number(q.get("limit")) || 100),
    }),
  },
  {
    method: "GET",
    re: /^\/mp\/v1\/moderation\/cases$/,
    rl: "read",
    auth: "mod",
    handler: (ctx, _p, q) => {
      const status = q.get("status") as "open" | "approved" | "dismissed" | null;
      return { cases: ctx.moderation.list(status ?? undefined) };
    },
  },
  {
    method: "GET",
    re: /^\/mp\/v1\/moderation\/cases\/(?<id>[a-z0-9_]{4,64})$/,
    rl: "read",
    auth: "mod",
    handler: (ctx, p) => ({ case: ctx.moderation.get(p.id) }),
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/moderation\/flag$/,
    rl: "write",
    auth: "mod",
    handler: (ctx, _p, _q, body, actor) => ({
      case: ctx.moderation.flag(actor, String(body.kind ?? "flaggedPlayer"), String(body.targetId ?? ""), cleanText(body.reason, 120)),
    }),
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/moderation\/cases\/(?<id>[a-z0-9_]{4,64})\/resolve$/,
    rl: "write",
    auth: "mod",
    handler: (ctx, p, _q, body, actor) => {
      const status = body.status === "dismissed" ? "dismissed" : "approved";
      return {
        case: ctx.moderation.resolve(
          p.id,
          actor,
          status,
          cleanText(body.note, 200),
          body.action === "suspend" || body.action === "mute" ? body.action : "none",
          Number(body.hours),
        ),
      };
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/moderation\/players\/(?<id>p_[a-f0-9]{24})\/suspend$/,
    rl: "write",
    auth: "mod",
    handler: (ctx, p, _q, body, actor) => {
      ctx.moderation.suspendPlayer(p.id, Number(body.days) || ctx.cfg.suspendDefaultDays, actor, cleanText(body.reason, 120));
      return { suspended: true };
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/moderation\/players\/(?<id>p_[a-f0-9]{24})\/restore$/,
    rl: "write",
    auth: "mod",
    handler: (ctx, p, _q, _b, actor) => {
      ctx.moderation.restorePlayer(p.id, actor);
      return { restored: true };
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/moderation\/players\/(?<id>p_[a-f0-9]{24})\/mute$/,
    rl: "write",
    auth: "mod",
    handler: (ctx, p, _q, body, actor) => {
      ctx.moderation.mutePlatform(p.id, Number(body.hours) || 24, actor);
      return { muted: true };
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/moderation\/players\/(?<id>p_[a-f0-9]{24})\/unmute$/,
    rl: "write",
    auth: "mod",
    handler: (ctx, p, _q, _b, actor) => {
      ctx.moderation.unmutePlatform(p.id, actor);
      return { unmuted: true };
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/moderation\/players\/(?<id>p_[a-f0-9]{24})\/scores\/invalidate$/,
    rl: "write",
    auth: "mod",
    handler: (ctx, p, _q, body, actor) => ({ invalidated: ctx.moderation.invalidateAll(actor, p.id, cleanText(body.reason, 120) || "manual rollback") }),
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/moderation\/scores\/(?<runId>[A-Za-z0-9_-]{4,80})\/invalidate$/,
    rl: "write",
    auth: "mod",
    handler: (ctx, p, _q, body, actor) => {
      ctx.moderation.invalidateScore(actor, p.runId, cleanText(body.reason, 120) || "manual rollback");
      return { invalidated: 1 };
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/moderation\/ghosts\/(?<id>[a-z0-9_-]{6,64})\/takedown$/,
    rl: "write",
    auth: "mod",
    handler: (ctx, p, _q, body, actor) => {
      ctx.moderation.takedownGhost(actor, p.id, cleanText(body.reason, 120) || "moderation");
      return { takenDown: true };
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/moderation\/squads\/(?<id>[a-z0-9_-]{4,40})\/disband$/,
    rl: "write",
    auth: "mod",
    handler: (ctx, p, _q, body, actor) => {
      ctx.moderation.disbandSquad(actor, p.id, cleanText(body.reason, 120) || "moderation");
      return { disbanded: true };
    },
  },
  {
    method: "POST",
    re: /^\/mp\/v1\/seasons\/snapshot$/,
    rl: "write",
    auth: "mod",
    handler: (ctx, _p, _q, body, actor) => {
      const season = cleanText(body.seasonId, 16) || seasonId(ctx.now());
      const reason = body.reason === "manual" || body.reason === "rollback" ? body.reason : "season-end";
      ctx.leaderboards.snapshotSeason(season, reason);
      ctx.audit.log(actor, "season.snapshot", season, { reason });
      return { seasonId: season };
    },
  },
];

/* ----------------------------------------------------------------- helpers */

function authFromBody(ctx: Ctx, token: unknown): string | null {
  if (typeof token !== "string" || token.length < 16) return null;
  return ctx.trust.verifySession(token, (t) => ctx.identity.isRevoked(t));
}
