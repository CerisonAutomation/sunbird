/**
 * RoomService — the registry and REST face of race rooms.
 *
 * Owns the RoomCode → RaceSession map, invite links
 * (`<base>/join?code=XXXXX`), public matchmaking, and the
 * create/join/leave/start/cancel/get/reconnect REST surface. Live movement
 * happens over the WebSocket gateways (v1 + legacy), which attach to the
 * same sessions.
 */
import type { Ctx } from "../core/ctx.js";
import { HttpError, cleanText } from "../util/http.js";
import { dailySeed, makeRoomCode } from "../util/id.js";
import { RaceSession } from "../realtime/race-session.js";
import type { RaceResult, RoomView, SeatGrant } from "../types.js";

const EMPTY_ROOM_TTL_MS = 5 * 60_000;
const FINISHED_ROOM_TTL_MS = 10 * 60_000;

export class RoomService {
  private sessions = new Map<string, RaceSession>();
  private pruneTimer: NodeJS.Timeout | null = null;

  constructor(private ctx: Ctx) {
    this.pruneTimer = setInterval(() => this.prune(), 60_000);
    this.pruneTimer.unref?.();
  }

  close(): void {
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    this.pruneTimer = null;
    for (const s of this.sessions.values()) s.destroy();
    this.sessions.clear();
  }

  /** Invite link: `<publicBase>/join?code=XXXXX` (query form, shareable). */
  inviteUrl(code: string): string {
    return `${this.ctx.cfg.publicBaseUrl}/join?code=${code}`;
  }

  /* ---------------------------------------------------------------- create */

  create(input: { playerId: string; name?: unknown; skin?: unknown; hue?: unknown; seed?: unknown }): {
    room: RoomView;
    grant: SeatGrant;
  } {
    this.ensureNotSuspended(input.playerId);
    const code = makeRoomCode((c) => this.sessions.has(c));
    const seed =
      typeof input.seed === "string" && input.seed.length > 0 && input.seed.length <= 64
        ? input.seed
        : dailySeed(this.ctx.now());
    const session = this.newSession(code, seed);
    const { seat } = session.join({
      playerId: input.playerId,
      name: cleanText(input.name, 14) || "Pilot",
      skin: cleanText(input.skin, 32) || "sunbird",
      hue: typeof input.hue === "number" ? input.hue : 0.06,
    });
    this.ctx.audit.log(input.playerId, "room.created", code, { seed });
    return { room: this.view(session), grant: this.grant(session, seat.seatId) };
  }

  /** Public matchmaking: first open lobby on the same seed, else a new room. */
  matchmake(input: { playerId: string; name?: unknown; skin?: unknown; hue?: unknown; seed?: unknown }): {
    room: RoomView;
    grant: SeatGrant;
  } {
    this.ensureNotSuspended(input.playerId);
    const seed =
      typeof input.seed === "string" && input.seed.length > 0 ? input.seed : dailySeed(this.ctx.now());
    for (const session of this.sessions.values()) {
      if (session.status === "lobby" && session.seed === seed && session.seatCount() < session.capacity) {
        const { seat } = session.join({
          playerId: input.playerId,
          name: cleanText(input.name, 14) || "Pilot",
          skin: cleanText(input.skin, 32) || "sunbird",
          hue: typeof input.hue === "number" ? input.hue : 0.06,
        });
        return { room: this.view(session), grant: this.grant(session, seat.seatId) };
      }
    }
    return this.create(input);
  }

  /* --------------------------------------------------------------- queries */

  byCode(code: string): RaceSession {
    const session = this.sessions.get(code.toUpperCase());
    if (!session) throw new HttpError(404, "room not found", "roomNotFound");
    return session;
  }

  get(code: string, viewerId?: string): RoomView {
    return this.view(this.byCode(code), viewerId);
  }

  /** Join (or re-seat) via REST. The client then attaches over WS. */
  join(
    code: string,
    input: {
      playerId: string;
      name?: unknown;
      skin?: unknown;
      hue?: unknown;
      reconnectToken?: unknown;
      seatId?: unknown;
    },
  ): SeatGrant {
    this.ensureNotSuspended(input.playerId);
    const session = this.byCode(code);
    const { seat } = session.join({
      playerId: input.playerId,
      name: cleanText(input.name, 14) || "Pilot",
      skin: cleanText(input.skin, 32) || "sunbird",
      hue: typeof input.hue === "number" ? input.hue : 0.06,
      reconnectToken: typeof input.reconnectToken === "string" ? input.reconnectToken : undefined,
      seatId: typeof input.seatId === "string" ? input.seatId : undefined,
    });
    return this.grant(session, seat.seatId);
  }

  reconnect(code: string, input: { playerId: string; seatId?: unknown; reconnectToken?: unknown }): SeatGrant {
    this.ensureNotSuspended(input.playerId);
    const session = this.byCode(code);
    if (typeof input.seatId !== "string" || typeof input.reconnectToken !== "string") {
      throw new HttpError(400, "seatId and reconnectToken are required", "invalidReconnect");
    }
    const { seat } = session.join({
      playerId: input.playerId,
      name: "Pilot",
      skin: "sunbird",
      hue: 0,
      seatId: input.seatId,
      reconnectToken: input.reconnectToken,
    });
    return this.grant(session, seat.seatId);
  }

  leave(code: string, playerId: string): void {
    const session = this.byCode(code);
    const seat = session.seatsForPlayer(playerId);
    if (!seat) throw new HttpError(404, "not seated in this room", "seatNotFound");
    session.leave(seat.seatId);
  }

  start(code: string, bySeatId?: string): RoomView {
    const session = this.byCode(code);
    session.start(bySeatId);
    return this.view(session);
  }

  cancel(code: string, bySeatId?: string): RoomView {
    const session = this.byCode(code);
    session.cancel(bySeatId);
    return this.view(session);
  }

  /** Authoritative result submission (match-token gated). */
  submitResult(
    code: string,
    playerId: string,
    input: { matchToken: unknown; runId?: unknown; seed?: unknown },
  ): RaceResult {
    const session = this.byCode(code);
    if (session.status !== "finished" && session.status !== "racing") {
      throw new HttpError(409, "race has no results yet", "noResults");
    }
    if (typeof input.matchToken !== "string" || input.matchToken.length < 16 || input.matchToken.length > 512) {
      throw new HttpError(400, "match token required", "invalidToken");
    }
    if (!this.ctx.trust.verifyMatch(input.matchToken, playerId, session.matchId, session.code)) {
      throw new HttpError(403, "invalid match token", "invalidToken");
    }
    // Version pinning: the result seed must be the server-generated one.
    if (typeof input.seed === "string" && input.seed !== session.seed) {
      this.ctx.audit.log(playerId, "room.result_seed_mismatch", code, { sent: input.seed, expected: session.seed });
      throw new HttpError(403, "seed mismatch", "seedMismatch");
    }
    const standings = session.standings();
    const mine = standings.find((s) => s.playerId === playerId);
    if (!mine) throw new HttpError(404, "no seat recorded for this pilot", "seatNotFound");
    this.ctx.audit.log(playerId, "room.result_submitted", code, {
      place: mine.place,
      distance: mine.distance,
      runId: typeof input.runId === "string" ? input.runId : undefined,
    });
    return {
      matchId: session.matchId,
      roomId: session.id,
      code: session.code,
      seed: session.seed,
      finishedAt: new Date(session.finishedAtMs || this.ctx.now()).toISOString(),
      standings: standings.map((s) => ({
        seatId: s.seatId,
        playerId: s.playerId,
        name: s.name,
        place: s.place,
        distance: s.distance,
        score: s.score,
        timeMs: s.timeMs,
        dnf: s.dnf,
      })),
    };
  }

  /** Suspended players are kicked from every live room (propagation). */
  kickPlayer(playerId: string, reason: string): void {
    for (const session of this.sessions.values()) {
      const seat = session.seatsForPlayer(playerId);
      if (seat) {
        session.leave(seat.seatId);
        this.ctx.audit.log(playerId, "room.kicked", session.code, { reason });
      }
    }
  }

  /* ----------------------------------------------------------------- prune */

  private prune(): void {
    const now = this.ctx.now();
    for (const [code, session] of this.sessions) {
      const terminal = session.status === "finished" || session.status === "canceled";
      if (!session.empty()) continue;
      const age = terminal ? now - (session.finishedAtMs || now) : now - Math.max(session.lastActivity(), session.createdAtMs);
      const ttl = terminal ? FINISHED_ROOM_TTL_MS : EMPTY_ROOM_TTL_MS;
      if (age > ttl) {
        session.destroy();
        this.sessions.delete(code);
      }
    }
  }

  /* -------------------------------------------------------------- internal */

  private newSession(code: string, seed: string): RaceSession {
    const session = new RaceSession({
      roomCode: code,
      seed,
      capacity: this.ctx.cfg.roomCapacity,
      tickHz: this.ctx.cfg.tickHz,
      startCountdownMs: this.ctx.cfg.startCountdownMs,
      reconnectGraceMs: this.ctx.cfg.reconnectGraceMs,
      dnfGraceMs: this.ctx.cfg.dnfGraceMs,
      maxRaceMs: this.ctx.cfg.maxRaceMs,
      tokenSecret: this.ctx.cfg.tokenSecret,
      signMatch: (playerId, matchId, roomCode) => this.ctx.trust.signMatch(playerId, matchId, roomCode),
      now: this.ctx.now,
      onFinished: (s) =>
        this.ctx.audit.log("room", "room.finished", s.code, { matchId: s.matchId, pilots: s.standings().length }),
    });
    this.sessions.set(code, session);
    return session;
  }

  /** The gateway needs raw access to attach sockets. */
  session(code: string): RaceSession | undefined {
    return this.sessions.get(code.toUpperCase());
  }

  createForGateway(code: string, seed: string): RaceSession {
    const existing = this.sessions.get(code);
    if (existing) return existing;
    return this.newSession(code, seed);
  }

  sessionCount(): number {
    return this.sessions.size;
  }

  pilotCount(): number {
    let n = 0;
    for (const s of this.sessions.values()) n += s.seatCount();
    return n;
  }

  private ensureNotSuspended(playerId: string): void {
    if (this.ctx.identity.isSuspended(playerId)) throw new HttpError(403, "account suspended", "suspended");
  }

  private grant(session: RaceSession, seatId: string): SeatGrant {
    const seat = session.seat(seatId);
    if (!seat) throw new HttpError(404, "seat not found", "seatNotFound");
    return {
      roomId: session.id,
      seatId: seat.seatId,
      playerId: seat.playerId,
      generation: seat.generation,
      reconnectToken: seat.reconnectToken,
      inviteUrl: this.inviteUrl(session.code),
    };
  }

  private view(session: RaceSession, viewerId?: string): RoomView {
    void viewerId;
    const pilots = session.publicSeats().map((s) => ({
      seatId: s.seatId,
      playerId: s.playerId,
      name: s.name,
      skin: s.skin,
      hue: s.hue,
      ready: s.ready,
      connected: s.phase === "connected",
      host: s.seatId === session.hostSeatId,
      finished: Boolean(s.finish),
    }));
    return {
      roomId: session.id,
      code: session.code,
      seed: session.seed,
      matchId: session.matchId,
      capacity: session.capacity,
      status: session.status,
      hostSeatId: session.hostSeatId,
      startAtMs: session.startAtMs,
      inviteUrl: this.inviteUrl(session.code),
      pilots,
    };
  }
}
