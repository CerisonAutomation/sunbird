import { describe, expect, it } from "vitest";
import { buildCtx } from "../src/server.js";
import type { Ctx } from "../src/core/ctx.js";

/**
 * Finish places are the scoreboard. They must be unique for a whole race, even
 * when pilots leave: the botsim gate "finish places are unique" caught the Node
 * reference server handing out P1 twice after a finished pilot left the room
 * (the place was derived from a list that prunes leavers — the Rust service
 * never reuses a place, so the two servers disagreed).
 */

function seated(ctx: Ctx, device: string, name: string) {
  const playerId = ctx.identity.createGuest({ deviceId: device }).playerId;
  ctx.identity.updateName(playerId, name);
  return playerId;
}

function race(ctx: Ctx) {
  const host = seated(ctx, "device-host", "Alita");
  const guest = seated(ctx, "device-guest", "Bravo");
  const third = seated(ctx, "device-third", "Cara");
  const { room, grant } = ctx.rooms.create({ playerId: host, name: "Alita", skin: "sunbird" });
  ctx.rooms.join(room.code, { playerId: guest, name: "Bravo", skin: "sunbird" });
  ctx.rooms.join(room.code, { playerId: third, name: "Cara", skin: "sunbird" });
  ctx.rooms.start(room.code, grant.seatId);
  const session = ctx.rooms.session(room.code)!;
  const seatOf = (playerId: string) => session.seatsForPlayer(playerId)!.seatId;
  // Standings are emitted before the seats are swept, so recording the sink is
  // how the room (and the botsim gate) actually sees the final scoreboard.
  const results: { place: number; name: string; dnf: boolean }[][] = [];
  session.attach({
    toSeat: () => {},
    toAll: (frame) => {
      const f = frame as { type?: string; standings?: { place: number; name: string; dnf: boolean }[] };
      if (f.type === "results" && f.standings) results.push(f.standings);
    },
  });
  return { ctx, code: room.code, session, host, guest, third, seatOf, results };
}

describe("finish places", () => {
  it("hands out 1, 2, 3 in arrival order", () => {
    const { session, seatOf, host, guest, third, results } = race(buildCtx());
    expect(session.finish(seatOf(host), 1000, 500)?.place).toBe(1);
    expect(session.finish(seatOf(guest), 1100, 480)?.place).toBe(2);
    expect(session.finish(seatOf(third), 1200, 460)?.place).toBe(3);
    const board = results.at(-1)!;
    expect(board.map((r) => r.place)).toEqual([1, 2, 3]);
    expect(new Set(board.map((r) => r.place)).size).toBe(3);
  });

  it("never reuses a place when a finished pilot leaves the room", () => {
    const ctx = buildCtx();
    const { code, session, seatOf, host, guest } = race(ctx);
    expect(session.finish(seatOf(host), 1000, 500)?.place).toBe(1);
    // The winner leaves; their seat is pruned from the room.
    ctx.rooms.leave(code, host);
    expect(session.seatsForPlayer(host)).toBeUndefined();
    // The next finisher must be P2 — not P1 again.
    expect(session.finish(seatOf(guest), 1100, 480)?.place).toBe(2);
  });

  it("never reuses a place when a pilot leaves mid-race without finishing", () => {
    const ctx = buildCtx();
    const { code, session, seatOf, host, guest, third } = race(ctx);
    // Cara never finishes: leaving marks her DNF (which takes the next place)…
    ctx.rooms.leave(code, third);
    // …so the pilots who actually cross the line must not collide with it.
    const hostPlace = session.finish(seatOf(host), 1000, 500)?.place;
    const guestPlace = session.finish(seatOf(guest), 1100, 480)?.place;
    expect(hostPlace).toBe(2);
    expect(guestPlace).toBe(3);
  });

  it("keeps places unique across a wave of finishes in the same tick", () => {
    const { session, seatOf, host, guest, third } = race(buildCtx());
    const seats = [seatOf(host), seatOf(guest), seatOf(third)];
    const places = seats.map((seatId) => session.finish(seatId, 1000, 500)?.place);
    expect(places).toEqual([1, 2, 3]);
    expect(new Set(places).size).toBe(3);
    // A repeated finish claim never earns a new place (the race is over).
    expect(session.finish(seats[0]!, 1000, 500)).toBeNull();
  });
});
