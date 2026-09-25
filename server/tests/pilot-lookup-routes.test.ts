import { describe, expect, it } from "vitest";
import { buildCtx } from "../src/server.js";
import { LEGACY_ROUTES } from "../src/http/legacy.js";
import type { Ctx } from "../src/core/ctx.js";
import type { Route } from "../src/http/router.js";

/**
 * Pilot Lookup contract (the routes the game's Squad panel calls).
 *
 * The panel is only allowed to show real pilots, so the directory must be
 * exact and honest: an unknown code is a 404 (never a filler pilot), a known
 * code returns the pilot's real name/presence/best, and adding someone says
 * "request sent" until they actually accept.
 */

function route(method: string, path: string): Route {
  const r = LEGACY_ROUTES.find((rt) => rt.method === method && rt.re.test(path));
  if (!r) throw new Error(`no route for ${method} ${path}`);
  return r;
}

function params(re: RegExp, path: string): Record<string, string> {
  const m = re.exec(path);
  const out: Record<string, string> = {};
  if (m?.groups) for (const [k, v] of Object.entries(m.groups)) if (v !== undefined) out[k] = v;
  return out;
}

function call(
  ctx: Ctx,
  method: string,
  path: string,
  { body = {}, actor = "" }: { body?: Record<string, unknown>; actor?: string } = {},
): unknown {
  const r = route(method, path);
  return r.handler(ctx, params(r.re, path), new URLSearchParams(), body as never, actor);
}

/** Register a guest the way the client does, and give them a real name. */
function pilot(ctx: Ctx, deviceId: string, name: string) {
  const id = ctx.identity.createGuest({ deviceId }).playerId;
  ctx.identity.updateName(id, name);
  ctx.identity.touchPresence(id);
  return { id, code: ctx.db.state.profiles[id]!.playerCode };
}

describe("legacy pilot lookup routes", () => {
  it("returns the real pilot for an exact code, with presence and best distance", () => {
    const ctx = buildCtx();
    const alita = pilot(ctx, "device-alita", "Alita");
    const bravo = pilot(ctx, "device-bravo", "Bravo");
    ctx.leaderboards.submitLegacy({
      deviceId: "device-bravo",
      name: "Bravo",
      distance: 4210,
      altitude: 300,
      perfects: 3,
      coins: 12,
      score: 1000,
    });

    const res = call(ctx, "GET", `/social/players/${bravo.code}`, { actor: alita.id }) as {
      pilot: { name: string; code: string; online: boolean; bestDistance: number; friend: boolean };
    };

    expect(res.pilot.name).toBe("Bravo");
    expect(res.pilot.code).toBe(bravo.code);
    expect(res.pilot.online).toBe(true);
    expect(res.pilot.bestDistance).toBe(4210);
    expect(res.pilot.friend).toBe(false);
  });

  it("404s an unknown code instead of inventing a pilot", () => {
    const ctx = buildCtx();
    const alita = pilot(ctx, "device-alita", "Alita");
    expect(() => call(ctx, "GET", "/social/players/SUN-ZZZZZZ", { actor: alita.id })).toThrowError(/no pilot with that code/i);
  });

  it("honours a pilot's presence privacy", () => {
    const ctx = buildCtx();
    const alita = pilot(ctx, "device-alita", "Alita");
    const bravo = pilot(ctx, "device-bravo", "Bravo");
    ctx.identity.updatePrivacy(bravo.id, { showPresence: false });

    const res = call(ctx, "GET", `/social/players/${bravo.code}`, { actor: alita.id }) as {
      pilot: { online: boolean; countryCode: string };
    };
    expect(res.pilot.online).toBe(false);
    expect(res.pilot.countryCode).toBe("");
  });

  it("reports a request as pending on both sides, then as wingmen after acceptance", () => {
    const ctx = buildCtx();
    const alita = pilot(ctx, "device-alita", "Alita");
    const bravo = pilot(ctx, "device-bravo", "Bravo");

    const added = call(ctx, "POST", "/social/friends/add", { body: { code: bravo.code }, actor: alita.id }) as {
      status: string;
      friend: { name: string; code: string };
    };
    expect(added.status).toBe("requested");
    expect(added.friend.name).toBe("Bravo");

    const outgoing = call(ctx, "GET", "/social/friends/requests", { actor: alita.id }) as {
      outgoing: { requestId: string; name: string }[];
      incoming: unknown[];
    };
    const incoming = call(ctx, "GET", "/social/friends/requests", { actor: bravo.id }) as {
      outgoing: unknown[];
      incoming: { requestId: string; name: string }[];
    };
    expect(outgoing.outgoing.map((r) => r.name)).toEqual(["Bravo"]);
    expect(outgoing.incoming).toEqual([]);
    expect(incoming.incoming.map((r) => r.name)).toEqual(["Alita"]);

    const accepted = call(ctx, "POST", "/social/friends/respond", {
      body: { requestId: incoming.incoming[0]!.requestId, accept: true },
      actor: bravo.id,
    }) as { status: string };
    expect(accepted.status).toBe("accepted");

    const profile = call(ctx, "GET", "/social/profile", { actor: alita.id }) as {
      friends: { name: string; code: string; online: boolean; bestDistance: number }[];
    };
    expect(profile.friends.map((f) => f.name)).toEqual(["Bravo"]);
    expect(profile.friends[0]!.code).toBe(bravo.code);
    expect(profile.friends[0]!.online).toBe(true);

    // Re-adding now tells the truth instead of queueing a duplicate request.
    const again = call(ctx, "POST", "/social/friends/add", { body: { code: bravo.code }, actor: alita.id }) as {
      status: string;
    };
    expect(again.status).toBe("friends");
  });

  it("accepts automatically when the other pilot had already asked", () => {
    const ctx = buildCtx();
    const alita = pilot(ctx, "device-alita", "Alita");
    const bravo = pilot(ctx, "device-bravo", "Bravo");
    ctx.friends.sendRequest(bravo.id, alita.code);

    const res = call(ctx, "POST", "/social/friends/add", { body: { code: bravo.code }, actor: alita.id }) as {
      status: string;
      friend: { name: string };
    };
    expect(res.status).toBe("accepted");
    expect(res.friend.name).toBe("Bravo");
    expect(ctx.friends.areFriends(alita.id, bravo.id)).toBe(true);
  });

  it("rejects your own code and unknown codes on add", () => {
    const ctx = buildCtx();
    const alita = pilot(ctx, "device-alita", "Alita");
    expect(() => call(ctx, "POST", "/social/friends/add", { body: { code: alita.code }, actor: alita.id })).toThrowError(/own code/i);
    expect(() => call(ctx, "POST", "/social/friends/add", { body: { code: "SUN-ZZZZZZ" }, actor: alita.id })).toThrowError(/no pilot/i);
  });

  it("lets a sender cancel their request", () => {
    const ctx = buildCtx();
    const alita = pilot(ctx, "device-alita", "Alita");
    const bravo = pilot(ctx, "device-bravo", "Bravo");
    call(ctx, "POST", "/social/friends/add", { body: { code: bravo.code }, actor: alita.id });
    const out = call(ctx, "GET", "/social/friends/requests", { actor: alita.id }) as { outgoing: { requestId: string }[] };

    const cancelled = call(ctx, "POST", "/social/friends/cancel", {
      body: { requestId: out.outgoing[0]!.requestId },
      actor: alita.id,
    }) as { status: string };
    expect(cancelled.status).toBe("canceled");
    expect((call(ctx, "GET", "/social/friends/requests", { actor: alita.id }) as { outgoing: unknown[] }).outgoing).toEqual([]);
  });
});
