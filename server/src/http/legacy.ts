/**
 * Legacy compatibility API — the wire contracts the shipped client and the
 * reference servers speak (server/sunbird-server.mjs /score + /board,
 * GhostNet /ghost, the social-server surface). New clients use /mp/v1;
 * these routes exist so existing deployments and the portal builds keep
 * working, and they all resolve to the SAME canonical stores as v1.
 *
 * Note: the old social server's free-text /chat is intentionally NOT carried
 * forward — squads ship emote shouts only (anti-spam policy). /chat returns
 * 410.
 */
import { cleanText, HttpError } from "../util/http.js";
import type { Route } from "./router.js";
import { devicePlayer } from "./router.js";
import type { BoardMetric, BoardScope, PrivacySettings } from "../types.js";

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

export const LEGACY_ROUTES: Route[] = [
  /* ------------------------------------------------------------- identity */

  {
    // Old client: POST /mp/session {deviceId} → {token, playerId}
    method: "POST",
    re: /^\/mp\/session$/,
    rl: "guest",
    auth: "guest",
    handler: (ctx, _p, _q, _body, actor) => {
      ctx.identity.touchPresence(actor);
      const token = ctx.trust.signSession(actor, ctx.now());
      return { token, playerId: actor, code: ctx.db.state.profiles[actor]?.playerCode };
    },
  },
  {
    // Merge this device into an existing account by exact player code.
    method: "POST",
    re: /^\/mp\/session\/link$/,
    rl: "guest",
    auth: "guest",
    handler: (ctx, _p, _q, body, actor) => {
      const code = cleanText(body.code, 16).toUpperCase();
      if (!code) throw new HttpError(400, "code required", "invalidCode");
      const target = ctx.identity.byCode(code);
      if (!target) throw new HttpError(404, "no pilot with that code", "notFound");
      mergeDeviceInto(ctx, actor, target.playerId);
      const token = ctx.trust.signSession(target.playerId, ctx.now());
      return { token, playerId: target.playerId, code: target.playerCode, profile: ctx.identity.publicView(target.playerId, target.playerId) };
    },
  },
  {
    // Old profile merge: POST /mp/profile {deviceId, code?, name?, countryCode?, privacy?}
    method: "POST",
    re: /^\/mp\/profile$/,
    rl: "guest",
    auth: "guest",
    handler: (ctx, _p, _q, body, actor) => {
      const profile = ctx.db.state.profiles[actor];
      const name = cleanText(body.name, 14);
      if (name && profile) ctx.identity.updateName(actor, name);
      if (typeof body.countryCode === "string" && profile) profile.countryCode = cleanText(body.countryCode, 2).toUpperCase() || undefined;
      if (body.privacy && typeof body.privacy === "object") {
        const pv = body.privacy as Record<string, unknown>;
        const patch: Partial<PrivacySettings> = {};
        if (typeof pv.showOnLeaderboards === "boolean") patch.showOnLeaderboards = pv.showOnLeaderboards;
        if (typeof pv.allowFriendRequests === "boolean") patch.allowFriendRequests = pv.allowFriendRequests;
        if (typeof pv.allowInvites === "boolean") patch.allowInvites = pv.allowInvites;
        if (typeof pv.showPresence === "boolean") patch.showPresence = pv.showPresence;
        if (pv.replays === "public" || pv.replays === "friends" || pv.replays === "private") patch.replays = pv.replays;
        if (Object.keys(patch).length > 0) ctx.identity.updatePrivacy(actor, patch);
      }
      ctx.db.touch();
      const token = ctx.trust.signSession(actor, ctx.now());
      return { token, playerId: actor, code: profile?.playerCode, profile: ctx.identity.publicView(actor, actor) };
    },
  },

  /* ----------------------------------------------------------- leaderboard */

  {
    // Old client: GET /mp/board?metric=&scope=&device=
    method: "GET",
    re: /^\/mp\/board$/,
    rl: "read",
    auth: "optional",
    handler: (ctx, _p, q) => {
      const device = cleanText(q.get("device"), 64);
      if (!device) return { entries: [], rank: 0, total: 0 };
      return ctx.leaderboards.legacyBoard(device, scope(q), metric(q));
    },
  },
  {
    // Old client: POST /mp/score (deviceId-keyed, best-per-device)
    method: "POST",
    re: /^\/mp\/score$/,
    rl: "guest",
    auth: "guest",
    handler: (ctx, _p, _q, body, actor) => {
      const out = ctx.leaderboards.submitLegacy({
        deviceId: cleanText(body.deviceId, 64) || deviceIdFor(ctx, actor),
        name: body.name,
        skin: body.skin,
        distance: body.distance,
        altitude: body.altitude,
        perfects: body.perfects,
        coins: body.coins,
        score: body.score,
        date: body.date,
        sig: body.sig,
      });
      return { ...out };
    },
  },

  /* --------------------------------------------------------------- ghosts */

  {
    // GhostNet: POST /mp/ghost {seed, deviceId, name, distance, samples}
    method: "POST",
    re: /^\/mp\/ghost$/,
    rl: "guest",
    auth: "guest",
    bodyMaxBytes: 256 * 1024,
    handler: (ctx, _p, _q, body, actor) => {
      return ctx.ghosts.publishLegacy({
        seed: body.seed,
        deviceId: cleanText(body.deviceId, 64) || deviceIdFor(ctx, actor),
        name: body.name,
        distance: body.distance,
        samples: body.samples,
      });
    },
  },
  {
    // GhostNet: GET /mp/ghost?seed=&device=&near= → {ghost: {name,distance,samples}|null}
    method: "GET",
    re: /^\/mp\/ghost$/,
    rl: "read",
    auth: "optional",
    handler: async (ctx, _p, q, _body, actor) => {
      const seed = cleanText(q.get("seed"), 64);
      const near = Number(q.get("near")) || 0;
      const device = cleanText(q.get("device"), 64);
      const record = device
        ? await ctx.ghosts.rivalLegacy(seed, device, near)
        : actor
          ? await ctx.ghosts.rival(seed, actor, near)
          : null;
      if (!record) return { ghost: null };
      return { ghost: { name: record.name, distance: record.distance, samples: record.samples, seed: record.seed } };
    },
  },

  /* ------------------------------------------------------- legacy room REST */

  {
    method: "POST",
    re: /^\/mp\/rooms\/matchmake$/,
    rl: "write",
    auth: "guest",
    handler: (ctx, _p, _q, body, actor) => roomCreate(ctx, actor, body, true),
  },
  {
    method: "POST",
    re: /^\/mp\/rooms$/,
    rl: "write",
    auth: "guest",
    handler: (ctx, _p, _q, body, actor) => roomCreate(ctx, actor, body, false),
  },
  {
    method: "GET",
    re: /^\/mp\/rooms\/(?<code>[A-Z0-9]{5})$/,
    rl: "read",
    auth: "optional",
    handler: (ctx, p, _q, _b, actor) => ({ room: ctx.rooms.get(p.code, actor || undefined) }),
  },
  {
    method: "POST",
    re: /^\/mp\/rooms\/(?<code>[A-Z0-9]{5})\/join$/,
    rl: "write",
    auth: "guest",
    handler: (ctx, p, _q, body, actor) => ({ grant: ctx.rooms.join(p.code, { playerId: actor, name: body.name, skin: body.skin, hue: body.hue }) }),
  },
  {
    method: "POST",
    re: /^\/mp\/rooms\/(?<code>[A-Z0-9]{5})\/leave$/,
    rl: "write",
    auth: "guest",
    handler: (ctx, p, _q, _b, actor) => {
      ctx.rooms.leave(p.code, actor);
      return undefined;
    },
  },
  {
    method: "POST",
    re: /^\/mp\/rooms\/(?<code>[A-Z0-9]{5})\/start$/,
    rl: "write",
    auth: "guest",
    handler: (ctx, p, _q, _b, actor) => ({ room: hostStart(ctx, p.code, actor) }),
  },
  {
    method: "POST",
    re: /^\/mp\/rooms\/(?<code>[A-Z0-9]{5})\/kick$/,
    rl: "write",
    auth: "guest",
    handler: (ctx, p, _q, body, actor) => {
      const target = typeof body.playerId === "string" ? body.playerId : devicePlayer(ctx, body.deviceId);
      const session = ctx.rooms.byCode(p.code);
      if (session.hostSeat?.playerId !== actor) throw new HttpError(403, "host only", "notHost");
      const victim = session.seatsForPlayer(target);
      if (victim) session.leave(victim.seatId);
      ctx.audit.log(actor, "room.kicked", target, { room: p.code });
      return undefined;
    },
  },
  {
    method: "POST",
    re: /^\/mp\/rooms\/(?<code>[A-Z0-9]{5})\/result$/,
    rl: "write",
    auth: "guest",
    handler: (ctx, p, _q, body, actor) => ({
      result: ctx.rooms.submitResult(p.code, actor, { matchToken: body.matchToken, runId: body.runId, seed: body.seed }),
    }),
  },

  /* --------------------------------------------------------------- social */

  {
    method: "POST",
    re: /^\/social\/register$/,
    rl: "guest",
    auth: "guest",
    handler: (ctx, _p, _q, _body, actor) => {
      const profile = ctx.db.state.profiles[actor];
      return { ok: true, code: profile?.playerCode, playerId: actor };
    },
  },
  {
    method: "GET",
    re: /^\/social\/profile$/,
    rl: "read",
    auth: "guest",
    handler: (ctx, _p, _q, _b, actor) => {
      const profile = ctx.db.state.profiles[actor];
      if (!profile) throw new HttpError(404, "not registered", "notFound");
      const friends = ctx.friends.listFriends(actor).map((f) => ({
        name: f.displayName,
        code: ctx.db.state.profiles[f.playerId]?.playerCode ?? f.playerId,
        clubId: null,
      }));
      return { name: profile.displayName, code: profile.playerCode, clubId: null, friends, playerId: actor };
    },
  },
  {
    method: "POST",
    re: /^\/social\/friends\/add$/,
    rl: "write",
    auth: "guest",
    handler: (ctx, _p, _q, body, actor) => {
      const code = cleanText(body.code, 16).toUpperCase();
      const target = code ? ctx.identity.byCode(code) : null;
      if (!target) throw new HttpError(404, "No pilot with that code", "notFound");
      if (target.playerId === actor) throw new HttpError(400, "That's your own code", "self");
      const req = ctx.friends.sendRequest(actor, target.playerCode);
      return { ok: true, friend: { name: target.displayName, code: target.playerCode, requestId: req.id } };
    },
  },
  {
    method: "POST",
    re: /^\/social\/friends\/remove$/,
    rl: "write",
    auth: "guest",
    handler: (ctx, _p, _q, body, actor) => {
      const code = cleanText(body.code, 16).toUpperCase();
      const target = code ? ctx.identity.byCode(code) : null;
      if (target) ctx.friends.removeFriend(actor, target.playerId);
      return { ok: true };
    },
  },
  {
    method: "GET",
    re: /^\/social\/clubs$/,
    rl: "read",
    auth: "guest",
    handler: (ctx, _p, _q, _b, actor) => {
      const mine = ctx.squads.squadsOf(actor)[0] ?? null;
      const clubs = ctx.squads.browse().map((c) => ({ id: c.id, name: c.name, motto: "", members: c.members }));
      if (mine) {
        const full = ctx.squads.get(actor, mine.id).squad;
        clubs.unshift({ id: full.id, name: full.name, motto: full.description, members: full.members.length });
      }
      return { clubs, mine: mine?.id ?? null };
    },
  },
  {
    method: "POST",
    re: /^\/social\/clubs\/create$/,
    rl: "write",
    auth: "guest",
    handler: (ctx, _p, _q, body, actor) => {
      const name = cleanText(body.name, 20);
      if (!name) throw new HttpError(400, "Club needs a name", "invalidName");
      if (ctx.squads.squadsOf(actor).length > 0) throw new HttpError(409, "Leave your current club first", "alreadyInSquad");
      const squad = ctx.squads.create(actor, { name, description: body.motto, visibility: "public" });
      return { ok: true, club: { id: squad.id, name: squad.name, motto: squad.description } };
    },
  },
  {
    method: "POST",
    re: /^\/social\/clubs\/join$/,
    rl: "write",
    auth: "guest",
    handler: (ctx, _p, _q, body, actor) => {
      const clubId = typeof body.clubId === "string" ? body.clubId : String(body.clubId ?? "");
      if (!clubId) throw new HttpError(400, "Invalid club", "invalidClub");
      if (ctx.squads.squadsOf(actor).length > 0) throw new HttpError(409, "Leave your current club first", "alreadyInSquad");
      ctx.squads.join(actor, clubId, {});
      return { ok: true };
    },
  },
  {
    method: "POST",
    re: /^\/social\/clubs\/leave$/,
    rl: "write",
    auth: "guest",
    handler: (ctx, _p, _q, _b, actor) => {
      for (const s of ctx.squads.squadsOf(actor)) ctx.squads.leave(actor, s.id);
      return { ok: true };
    },
  },
  {
    // Free-text chat does not ship: squads use structured emote shouts.
    method: "GET",
    re: /^\/social\/chat$/,
    rl: "read",
    auth: "guest",
    handler: () => {
      throw new HttpError(410, "free-text chat is retired — squads use emote shouts (POST /mp/v1/squads/:id/shout)", "gone");
    },
  },
  {
    method: "POST",
    re: /^\/social\/chat$/,
    rl: "write",
    auth: "guest",
    handler: () => {
      throw new HttpError(410, "free-text chat is retired — squads use emote shouts (POST /mp/v1/squads/:id/shout)", "gone");
    },
  },
  {
    method: "GET",
    re: /^\/social\/health$/,
    rl: "read",
    auth: "guest",
    handler: (ctx) => ({
      ok: true,
      players: Object.keys(ctx.db.state.profiles).length,
      clubs: Object.keys(ctx.db.state.squads).length,
    }),
  },
];

/* ----------------------------------------------------------------- helpers */

/** Re-link a device (and its guest progress) onto an existing account. */
function mergeDeviceInto(ctx: Parameters<typeof LEGACY_ROUTES[0]["handler"]>[0], fromId: string, intoId: string): void {
  if (fromId === intoId) return;
  const s = ctx.db.state;
  const from = s.profiles[fromId];
  const into = s.profiles[intoId];
  if (!from || !into) return;
  for (const k of Object.keys(from.counters) as (keyof typeof from.counters)[]) {
    into.counters[k] = Math.max(into.counters[k], from.counters[k]);
  }
  for (const [id, at] of Object.entries(from.achievements)) {
    if (!into.achievements[id]) into.achievements[id] = at;
  }
  for (const [deviceId, pid] of Object.entries(s.guestLinks)) {
    if (pid === fromId) s.guestLinks[deviceId] = intoId;
  }
  if (from.guest) {
    delete s.profiles[fromId];
    delete s.codeIndex[from.playerCode];
  }
  ctx.db.touch();
  ctx.audit.log(fromId, "identity.merged_into", intoId);
}

/** Inverse lookup: the guest link key for a playerId (legacy score route). */
function deviceIdFor(ctx: Parameters<typeof LEGACY_ROUTES[0]["handler"]>[0], playerId: string): string {
  for (const [deviceId, pid] of Object.entries(ctx.db.state.guestLinks)) {
    if (pid === playerId) return deviceId;
  }
  return `anon-${playerId.slice(2, 10)}`;
}

function roomCreate(
  ctx: Parameters<typeof LEGACY_ROUTES[0]["handler"]>[0],
  actor: string,
  body: Record<string, unknown>,
  matchmake: boolean,
): { room: unknown; grant: unknown } {
  const profile = ctx.db.state.profiles[actor];
  const input = {
    playerId: actor,
    name: body.name ?? profile?.displayName,
    skin: body.skin,
    hue: body.hue,
    seed: body.seed,
  };
  return matchmake ? ctx.rooms.matchmake(input) : ctx.rooms.create(input);
}

function hostStart(ctx: Parameters<typeof LEGACY_ROUTES[0]["handler"]>[0], code: string, actor: string) {
  const session = ctx.rooms.byCode(code);
  const host = session.hostSeat;
  if (!host || host.playerId !== actor) throw new HttpError(403, "host only", "notHost");
  return ctx.rooms.start(code, host.seatId);
}
