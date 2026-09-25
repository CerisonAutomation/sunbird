import { describe, expect, it } from "vitest";
import { buildCtx } from "../src/server.js";
import { LEGACY_ROUTES } from "../src/http/legacy.js";
import { V1_ROUTES } from "../src/http/api.js";
import type { Ctx } from "../src/core/ctx.js";
import type { Route } from "../src/http/router.js";
import type { PublicRoom } from "../src/types.js";

/**
 * Public room list — "who is racing right now".
 *
 * This is the surface a newcomer reads before they commit to a race, so it has
 * to be both useful and safe: real seat counts and status, and never a pilot
 * identity, seat id or token. A room that is mid-race is reported honestly
 * (nobody can be promised a seat in a race already under way).
 */

function route(routes: Route[], method: string, path: string): Route {
  const r = routes.find((rt) => rt.method === method && rt.re.test(path));
  if (!r) throw new Error(`no route for ${method} ${path}`);
  return r;
}

function params(re: RegExp, path: string): Record<string, string> {
  const m = re.exec(path);
  const out: Record<string, string> = {};
  if (m?.groups) for (const [k, v] of Object.entries(m.groups)) if (v !== undefined) out[k] = v;
  return out;
}

function browse(ctx: Ctx, routes: Route[], path = "/mp/rooms", query = new URLSearchParams()): PublicRoom[] {
  const r = route(routes, "GET", path);
  const res = r.handler(ctx, params(r.re, path), query, {}, "") as { rooms: PublicRoom[] };
  return res.rooms;
}

function seated(ctx: Ctx, name: string, device: string) {
  const id = ctx.identity.createGuest({ deviceId: device }).playerId;
  ctx.identity.updateName(id, name);
  return { id, ...ctx.rooms.create({ playerId: id, name, skin: "sunbird" }) };
}

describe("public room list", () => {
  it("lists a real room with its seat count and no identities", () => {
    const ctx = buildCtx();
    const host = seated(ctx, "Alita", "device-alita");
    const guest = ctx.identity.createGuest({ deviceId: "device-bravo" }).playerId;
    ctx.rooms.join(host.room.code, { playerId: guest, name: "Bravo", skin: "sunbird" });

    const rooms = browse(ctx, LEGACY_ROUTES);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]).toMatchObject({
      code: host.room.code,
      status: "lobby",
      seated: 2,
      capacity: host.room.capacity,
      host: "Alita",
      joinable: true,
    });
    expect(typeof rooms[0]!.ageSeconds).toBe("number");

    // The payload carries NO pilot identity, seat id or token.
    const json = JSON.stringify(rooms);
    for (const secret of [host.id, guest, host.grant.seatId, host.grant.reconnectToken, host.room.roomId, host.room.matchId]) {
      expect(json).not.toContain(secret);
    }
    expect(json).not.toContain("playerId");
  });

  it("marks a race in progress as not joinable but still visible", () => {
    const ctx = buildCtx();
    const host = seated(ctx, "Alita", "device-alita");
    ctx.rooms.start(host.room.code, host.grant.seatId);

    const [room] = browse(ctx, LEGACY_ROUTES);
    expect(room).toMatchObject({ status: "racing", joinable: false, seated: 1 });
  });

  it("hides resolved rooms and respects the limit", () => {
    const ctx = buildCtx();
    const a = seated(ctx, "Alita", "device-alita");
    const b = seated(ctx, "Bravo", "device-bravo");
    expect(browse(ctx, LEGACY_ROUTES).map((r) => r.code).sort()).toEqual([a.room.code, b.room.code].sort());

    ctx.rooms.cancel(a.room.code, a.grant.seatId);
    const afterCancel = browse(ctx, LEGACY_ROUTES);
    expect(afterCancel.map((r) => r.code)).toEqual([b.room.code]);

    expect(browse(ctx, LEGACY_ROUTES, "/mp/rooms", new URLSearchParams("limit=1"))).toHaveLength(1);
    // A nonsense limit cannot ask for an unbounded list.
    expect(browse(ctx, LEGACY_ROUTES, "/mp/rooms", new URLSearchParams("limit=-5"))).toHaveLength(1);
  });

  it("serves the same list on the v1 API for token-or-guest callers", () => {
    const ctx = buildCtx();
    const host = seated(ctx, "Alita", "device-alita");
    const rooms = browse(ctx, V1_ROUTES, "/mp/v1/rooms");
    expect(rooms.map((r) => r.code)).toEqual([host.room.code]);
    expect(route(V1_ROUTES, "GET", "/mp/v1/rooms").auth).toBe("optional");
    expect(route(LEGACY_ROUTES, "GET", "/mp/rooms").auth).toBe("optional");
  });

  it("orders joinable rooms first so the list answers 'where can I fly?'", () => {
    const ctx = buildCtx();
    const busy = seated(ctx, "Alita", "device-alita");
    ctx.rooms.start(busy.room.code, busy.grant.seatId);
    const open = seated(ctx, "Bravo", "device-bravo");

    const rooms = browse(ctx, LEGACY_ROUTES);
    expect(rooms.map((r) => r.code)).toEqual([open.room.code, busy.room.code]);
    expect(rooms[0]!.joinable).toBe(true);
  });
});
