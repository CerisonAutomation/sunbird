/**
 * RaceSession — one authoritative race room.
 *
 * This class is the single source of truth for a live room:
 *   • server-generated `matchId` and `seed` (clients never pick them),
 *   • server-authoritative start (countdown after the all-ready barrier)
 *     and finish (places are assigned by the server in arrival order),
 *   • monotonic per-seat sequence numbers on every input/heartbeat,
 *   • server-side distance/score computation from validated positions,
 *   • heartbeat timeouts → DNF, reconnect grace, and host migration.
 *
 * Transport-agnostic: it emits events through a `SessionSink` so the same
 * session can drive the protocol-v1 gateway, the legacy `/ws` gateway, or a
 * test harness.
 */
import { randomId } from "../util/id.js";
import { LIMITS, serverScoreFor } from "../anticheat/limits.js";
import { signReconnectToken, verifyReconnectToken } from "./reconnect-token.js";

export type SeatPhase = "connected" | "reconnecting";

export type RaceSeat = {
  seatId: string;
  playerId: string;
  name: string;
  skin: string;
  hue: number;
  joinedAt: string;
  /** Bumped on every (re)connect — the client must echo it back. */
  generation: number;
  ready: boolean;
  phase: SeatPhase;
  /** Monotonic counter of accepted input/heartbeat frames. */
  lastSeq: number;
  /** Input cadence accounting (sliding 1s window). */
  inputWindowStart: number;
  inputWindowCount: number;
  state: { x: number; y: number; rot: number; distance: number } | null;
  lastSeenAt: number;
  /** Server-authoritative finish record. */
  finish: { place: number; timeMs: number; distance: number; score: number } | null;
  dnf: boolean;
  /** Reconnect credentials (opaque, HMAC-signed). */
  reconnectToken: string;
  /** Short-lived match token for result submission (issued at start). */
  matchToken: string | null;
};

export type RoomStatus = "lobby" | "racing" | "finished" | "canceled";

export type SessionEvent =
  | { type: "roster" }
  | { type: "started"; startAtMs: number; seed: string }
  | { type: "snapshot"; tick: number; serverTime: string; pilots: SnapshotPilot[] }
  | { type: "finish"; seatId: string; place: number; timeMs: number; distance: number }
  | { type: "seatLeft"; seatId: string }
  | { type: "emote"; seatId: string; emote: string }
  | { type: "results"; standings: SessionStanding[] }
  | { type: "kicked"; seatId: string; reason: string };

export type SnapshotPilot = {
  seatId: string;
  x: number;
  y: number;
  rotation: number;
  distance: number;
  finished: boolean;
};

export type SessionStanding = {
  seatId: string;
  playerId: string;
  name: string;
  place: number;
  distance: number;
  score: number;
  timeMs: number | null;
  dnf: boolean;
};

export type InputViolation = { kind: "sequence" | "bounds" | "rate" | "regression"; detail: string };

export type JoinInput = {
  playerId: string;
  name: string;
  skin: string;
  hue: number;
  /** Present when the client is reclaiming its seat. */
  reconnectToken?: string;
  seatId?: string;
};

type Sink = {
  /** Send a raw event frame to ONE seat's socket. */
  toSeat(seatId: string, frame: unknown): void;
  /** Broadcast a raw frame to every seat in the room. */
  toAll(frame: unknown): void;
  /** Called when a seat's socket is established/closed. */
  onSocketAttached?(seatId: string): void;
  onSocketDetached?(seatId: string): void;
};

type SessionOptions = {
  roomCode: string;
  seed: string;
  capacity: number;
  tickHz: number;
  startCountdownMs: number;
  reconnectGraceMs: number;
  dnfGraceMs: number;
  maxRaceMs: number;
  tokenSecret: string;
  /** Issues the short-lived match token for authoritative result submission. */
  signMatch: (playerId: string, matchId: string, roomCode: string) => string;
  now: () => number;
  onFinished?: (session: RaceSession) => void;
};

export class RaceSession {
  readonly id: string;
  readonly code: string;
  readonly seed: string;
  readonly capacity: number;
  /** Server-generated — never client-supplied. */
  readonly matchId: string;
  readonly createdAtMs: number;
  status: RoomStatus = "lobby";
  startAtMs = 0;
  finishedAtMs = 0;
  tick = 0;
  hostSeatId = "";

  private seats = new Map<string, RaceSeat>();
  private order: string[] = [];
  private finishOrder: string[] = [];
  private sink: Sink | null = null;
  private timer: NodeJS.Timeout | null = null;
  private graceTimer: NodeJS.Timeout | null = null;

  constructor(opts: SessionOptions) {
    this.id = randomId("room");
    this.createdAtMs = opts.now();
    this.code = opts.roomCode;
    this.seed = opts.seed;
    this.capacity = opts.capacity;
    this.matchId = randomId("match");
    this.opts = opts;
    this.timer = setInterval(() => this.tickStep(), Math.max(20, Math.round(1000 / opts.tickHz)));
    this.timer.unref?.();
  }

  private opts: SessionOptions;

  /** Bind the transport. Must be called before any seat joins. */
  attach(sink: Sink): void {
    this.sink = sink;
  }

  detach(): void {
    this.sink = null;
  }

  destroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = null;
  }

  /* ----------------------------------------------------------------- join */

  /**
   * Join or re-attach. A client presenting a valid reconnectToken for an
   * existing seat keeps its progress (generation bumps); otherwise a new
   * seat is granted.
   */
  join(input: JoinInput): { seat: RaceSeat; rejoined: boolean } {
    if (this.status === "finished" || this.status === "canceled") {
      throw new Error("roomClosed");
    }
    const now = this.opts.now();
    // Reconnect path first: token must match one of our seats.
    if (input.reconnectToken && input.seatId) {
      const seat = this.seats.get(input.seatId);
      if (seat && verifyReconnectToken(this.opts.tokenSecret, seat.playerId, input.seatId, seat.generation, input.reconnectToken)) {
        if (this.seatsForPlayer(input.playerId) && seat.playerId !== input.playerId) throw new Error("seatOccupied");
        seat.phase = "connected";
        seat.generation += 1;
        seat.lastSeenAt = now;
        seat.reconnectToken = this.issueReconnectToken(seat);
        this.migrateHost();
        this.emit({ type: "roster" });
        return { seat, rejoined: true };
      }
      throw new Error("invalidReconnectToken");
    }
    // Existing seat for this player (e.g. socket dropped, token lost) → same
    // reconnect semantics, token re-issued.
    const existing = this.seatsForPlayer(input.playerId);
    if (existing) {
      if (now - existing.lastSeenAt > this.opts.reconnectGraceMs) this.removeSeat(existing.seatId, "timeout");
      else {
        existing.phase = "connected";
        existing.generation += 1;
        existing.lastSeenAt = now;
        existing.reconnectToken = this.issueReconnectToken(existing);
        this.migrateHost();
        this.emit({ type: "roster" });
        return { seat: existing, rejoined: true };
      }
    }
    if (this.seats.size >= this.capacity) throw new Error("roomFull");

    const seatId = randomId("seat");
    const seat: RaceSeat = {
      seatId,
      playerId: input.playerId,
      name: input.name.slice(0, 14) || "Pilot",
      skin: input.skin.slice(0, 32) || "sunbird",
      hue: Number.isFinite(input.hue) ? input.hue : Math.random(),
      joinedAt: new Date(now).toISOString(),
      generation: 1,
      ready: false,
      phase: "connected",
      lastSeq: 0,
      inputWindowStart: now,
      inputWindowCount: 0,
      state: null,
      lastSeenAt: now,
      finish: null,
      dnf: false,
      reconnectToken: "",
      matchToken: null,
    };
    seat.reconnectToken = this.issueReconnectToken(seat);
    this.seats.set(seatId, seat);
    this.order.push(seatId);
    this.migrateHost();
    this.emit({ type: "roster" });
    return { seat, rejoined: false };
  }

  seatsForPlayer(playerId: string): RaceSeat | undefined {
    for (const s of this.seats.values()) if (s.playerId === playerId) return s;
    return undefined;
  }

  seat(seatId: string): RaceSeat | undefined {
    return this.seats.get(seatId);
  }

  get hostSeat(): RaceSeat | undefined {
    return this.seats.get(this.hostSeatId);
  }

  /** First CONNECTED seat in join order — host migration is O(n) on change. */
  migrateHost(): void {
    let next = "";
    for (const seatId of this.order) {
      const s = this.seats.get(seatId);
      if (s && s.phase === "connected") {
        next = seatId;
        break;
      }
    }
    if (next !== this.hostSeatId) {
      this.hostSeatId = next;
      this.emit({ type: "roster" });
    }
  }

  /* -------------------------------------------------------------- control */

  ready(seatId: string, ready: boolean): void {
    const seat = this.seats.get(seatId);
    if (!seat) throw new Error("seatNotFound");
    if (this.status !== "lobby") return;
    seat.ready = ready;
    this.emit({ type: "roster" });
    this.maybeStart();
  }

  /** Host-only explicit start (also called by the all-ready barrier). */
  start(bySeatId?: string): void {
    if (this.status !== "lobby") return;
    if (bySeatId && bySeatId !== this.hostSeatId) throw new Error("notHost");
    this.beginCountdown();
  }

  cancel(bySeatId?: string): void {
    if (this.status !== "lobby" && this.status !== "racing") return;
    if (bySeatId && bySeatId !== this.hostSeatId) throw new Error("notHost");
    this.status = "canceled";
    this.finishedAtMs = this.opts.now();
    const standings = this.standings();
    this.sweepSeats();
    this.emit({ type: "roster" });
    this.emit({ type: "results", standings });
  }

  leave(seatId: string): void {
    const seat = this.seats.get(seatId);
    if (!seat) return;
    if (this.status === "racing" && !seat.finish) {
      seat.dnf = true;
      seat.finish = {
        place: this.finishOrder.length + 1,
        timeMs: this.opts.now() - this.startAtMs,
        distance: Math.round(seat.state?.distance ?? 0),
        score: 0,
      };
      this.registerDnf(seat);
      this.emit({ type: "finish", seatId, place: seat.finish.place, timeMs: seat.finish.timeMs, distance: seat.finish.distance });
    }
    this.removeSeat(seatId, "leave");
  }

  /** Socket dropped (not an explicit leave): keep the seat for the grace window. */
  markDisconnected(seatId: string): void {
    const seat = this.seats.get(seatId);
    if (!seat || seat.phase === "reconnecting") return;
    seat.phase = "reconnecting";
    // lastSeenAt must be refreshed to the moment of disconnect so the grace
    // window is measured from the drop, not from the last inbound frame
    // (which could be arbitrarily older if the peer went radio-silent).
    seat.lastSeenAt = this.opts.now();
    // A dropped socket is no longer "ready" — if they reconnect they will
    // re-send ready. Without clearing this, an in-progress countdown fires
    // immediately after the drop and starts a new race with a ghost seat.
    seat.ready = false;
    this.migrateHost();
    this.emit({ type: "roster" });
    this.scheduleGrace(seatId);
  }

  /**
   * Liveness ping from the transport (any inbound frame keeps a seat warm).
   * The legacy gateway has no explicit heartbeat frame, so every inbound
   * message pokes the seat instead.
   */
  poke(seatId: string): void {
    const seat = this.seats.get(seatId);
    if (seat) this.touch(seat);
  }

  emote(seatId: string, emote: string): void {
    const seat = this.seats.get(seatId);
    if (!seat) return;
    this.emit({ type: "emote", seatId, emote: emote.slice(0, 12) });
  }

  /* ---------------------------------------------------------------- input */

  /**
   * A movement frame from the client. Enforces:
   *   • monotonically increasing sequence (replay/spoofed frames dropped),
   *   • per-seat input rate (sliding 1s window),
   *   • the wire movement envelope (per-tick delta, coordinate bounds),
   *   • distance monotonicity (no backward time-travel).
   * Returns a violation when the frame is rejected (the gateway rate-limits
   * and audits repeated offenders) — the seat's last state is preserved.
   */
  input(
    seatId: string,
    seq: number,
    x: number,
    y: number,
    rot: number,
    claimedDistance: number,
  ): { accepted: boolean; violation?: InputViolation } {
    const seat = this.seats.get(seatId);
    if (!seat) return { accepted: false, violation: { kind: "sequence", detail: "unknown seat" } };
    this.touch(seat);
    if (this.status === "finished" || this.status === "canceled") {
      return { accepted: false, violation: { kind: "sequence", detail: "room closed" } };
    }
    if (!Number.isFinite(seq) || !Number.isInteger(seq) || seq <= seat.lastSeq) {
      return { accepted: false, violation: { kind: "sequence", detail: `seq ${String(seq)} not after ${seat.lastSeq}` } };
    }
    seat.lastSeq = seq;
    // Rate: sliding window over the last second of accepted frames.
    const now = this.opts.now();
    if (now - seat.inputWindowStart > 1000) {
      seat.inputWindowStart = now;
      seat.inputWindowCount = 0;
    }
    seat.inputWindowCount += 1;
    if (seat.inputWindowCount > LIMITS.maxMessagesPerSec) {
      return { accepted: false, violation: { kind: "rate", detail: `> ${LIMITS.maxMessagesPerSec} msgs/s` } };
    }
    // Envelope (mirrors protocol/contract.json `movement`).
    if (Math.abs(x) > LIMITS.maxCoordinateAbs || Math.abs(y) > LIMITS.maxAltitudeAbs) {
      return { accepted: false, violation: { kind: "bounds", detail: "coordinate out of bounds" } };
    }
    if (Math.abs(rot) > LIMITS.maxRotationAbs) {
      return { accepted: false, violation: { kind: "bounds", detail: "rotation out of bounds" } };
    }
    if (!Number.isFinite(claimedDistance) || claimedDistance < 0 || claimedDistance > LIMITS.maxDistance) {
      return { accepted: false, violation: { kind: "bounds", detail: "distance out of bounds" } };
    }
    if (seat.state) {
      const dx = Math.abs(x - seat.state.x);
      const dy = Math.abs(y - seat.state.y);
      if (dx > LIMITS.maxStateDeltaXPerTick || dy > LIMITS.maxStateDeltaYPerTick) {
        return { accepted: false, violation: { kind: "bounds", detail: `delta ${dx.toFixed(1)}/${dy.toFixed(1)} exceeds per-tick envelope` } };
      }
      if (claimedDistance < seat.state.distance - LIMITS.distanceRegressionTolerance) {
        return { accepted: false, violation: { kind: "regression", detail: "distance went backwards" } };
      }
    }
    // Server-side distance: the max of the claim and the position-derived
    // distance — a lying client can only be LESS than the truth, never more.
    const authoritative = Math.max(claimedDistance, Math.max(0, x));
    if (authoritative > LIMITS.maxDistance) {
      return { accepted: false, violation: { kind: "bounds", detail: "distance above ceiling" } };
    }
    seat.state = { x, y, rot, distance: authoritative };
    this.touch(seat);
    return { accepted: true };
  }

  heartbeat(seatId: string, seq: number): { accepted: boolean; violation?: InputViolation } {
    const seat = this.seats.get(seatId);
    if (!seat) return { accepted: false, violation: { kind: "sequence", detail: "unknown seat" } };
    if (!Number.isFinite(seq) || !Number.isInteger(seq) || seq <= seat.lastSeq) {
      return { accepted: false, violation: { kind: "sequence", detail: `seq ${String(seq)} not after ${seat.lastSeq}` } };
    }
    seat.lastSeq = seq;
    this.touch(seat);
    return { accepted: true };
  }

  /**
   * Client reports it crossed the finish gate. The SERVER assigns the place
   * (arrival order) and the official time — the client's claim is only
   * cross-checked against the server-computed distance.
   */
  finish(seatId: string, claimedTimeMs: number, claimedDistance: number): { place: number; timeMs: number } | null {
    const seat = this.seats.get(seatId);
    if (!seat || seat.finish || this.status !== "racing") return null;
    const serverDistance = seat.state?.distance ?? Math.max(0, claimedDistance);
    const timeMs = Math.max(0, this.opts.now() - this.startAtMs);
    // A claimed finish time wildly inconsistent with server time is ignored
    // (server clock wins) but never poisons other pilots.
    void claimedTimeMs;
    seat.finish = {
      place: this.finishOrder.length + 1,
      timeMs,
      distance: Math.round(serverDistance),
      score: serverScoreFor(serverDistance),
    };
    this.finishOrder.push(seatId);
    this.emit({ type: "finish", seatId, place: seat.finish.place, timeMs, distance: seat.finish.distance });
    this.maybeComplete();
    return { place: seat.finish.place, timeMs };
  }

  /* ---------------------------------------------------------------- ticks */

  private tickStep(): void {
    const now = this.opts.now();
    if (this.status === "lobby") {
      // Lobby housekeeping: reap expired reconnect grace windows.
      for (const [seatId, seat] of this.seats) {
        if (seat.phase === "reconnecting" && now - seat.lastSeenAt > this.opts.reconnectGraceMs) {
          this.removeSeat(seatId, "timeout");
        }
      }
      if (this.seats.size === 0) this.status = "canceled";
      return;
    }
    if (this.status === "racing") {
      for (const [seatId, seat] of this.seats) {
        if (seat.phase !== "reconnecting" || seat.finish) continue;
        const silentMs = now - seat.lastSeenAt;
        if (silentMs > this.opts.reconnectGraceMs) {
          // Full reconnect grace elapsed: the seat is abandoned. DNF on
          // the way out.
          seat.dnf = true;
          seat.finish = {
            place: this.finishOrder.length + 1,
            timeMs: now - this.startAtMs,
            distance: Math.round(seat.state?.distance ?? 0),
            score: 0,
          };
          this.finishOrder.push(seatId);
          this.emit({ type: "finish", seatId, place: seat.finish.place, timeMs: seat.finish.timeMs, distance: seat.finish.distance });
          this.removeSeat(seatId, "timeout");
          this.maybeComplete();
        }
      }
      // Race cap: nobody flies forever. Assign places sequentially so a
      // wave of simultaneous timeouts can never collide on the same number.
      if (now - this.startAtMs > this.opts.maxRaceMs) {
        const dnfOrder = [...this.seats.values()]
          .filter((s) => !s.finish)
          .sort((a, b) => (b.state?.distance ?? 0) - (a.state?.distance ?? 0));
        for (const seat of dnfOrder) {
          seat.dnf = true;
          seat.finish = {
            place: this.finishOrder.length + 1,
            timeMs: now - this.startAtMs,
            distance: Math.round(seat.state?.distance ?? 0),
            score: 0,
          };
          this.finishOrder.push(seat.seatId);
          this.emit({ type: "finish", seatId: seat.seatId, place: seat.finish.place, timeMs: seat.finish.timeMs, distance: seat.finish.distance });
        }
        this.completeRace();
        return;
      }
    }
    // Snapshot broadcast at tick rate (only while racing with live pilots).
    this.tick += 1;
    const racingPilots = [...this.seats.values()].filter((s) => s.state && (s.phase === "connected" || this.status === "racing"));
    if (this.status === "racing" && racingPilots.length > 0) {
      const pilots: SnapshotPilot[] = racingPilots.map((s) => ({
        seatId: s.seatId,
        x: Math.round((s.state!.x) * 100) / 100,
        y: Math.round((s.state!.y) * 100) / 100,
        rotation: Math.round((s.state!.rot) * 100) / 100,
        distance: Math.round(s.state!.distance),
        finished: Boolean(s.finish),
      }));
      this.emit({ type: "snapshot", tick: this.tick, serverTime: new Date(now).toISOString(), pilots });
    }
  }

  private maybeStart(): void {
    if (this.status !== "lobby") return;
    const connected = [...this.seats.values()].filter((s) => s.phase === "connected");
    if (connected.length < 2) return;
    if (!connected.every((s) => s.ready)) return;
    this.beginCountdown();
  }

  private beginCountdown(): void {
    this.startAtMs = this.opts.now() + this.opts.startCountdownMs;
    // Issue short-lived match tokens the moment the race is committed.
    for (const seat of this.seats.values()) {
      seat.matchToken = this.opts.signMatch(seat.playerId, this.matchId, this.code);
    }
    this.status = "racing";
    this.emit({ type: "started", startAtMs: this.startAtMs, seed: this.seed });
  }

  private maybeComplete(): void {
    if (this.status !== "racing") return;
    const all = [...this.seats.values()];
    if (all.length === 0) return;
    // A race only completes when no seat is still flying AND no seat is in
    // the reconnecting grace window waiting to come back. A dropped pilot
    // still has their seat reserved until reconnectGraceMs elapses; counting
    // them as finished the moment the TCP FIN lands would immediately
    // destroy the field before they could re-attach.
    const flyingOrReconnecting = all.filter((s) => !s.finish && (s.phase === "connected" || s.phase === "reconnecting"));
    if (flyingOrReconnecting.length === 0) this.completeRace();
  }

  private completeRace(): void {
    if (this.status === "finished") return;
    this.status = "finished";
    this.finishedAtMs = this.opts.now();
    // Standings MUST be computed before the sweep — sweepSeats() clears
    // the seat map that standings() reads from.
    const standings = this.standings();
    this.sweepSeats();
    this.emit({ type: "results", standings });
    this.opts.onFinished?.(this);
  }

  private registerDnf(seat: RaceSeat): void {
    this.finishOrder.push(seat.seatId);
    this.maybeComplete();
  }

  /* --------------------------------------------------------------- results */

  /** Final standings: finishers by time, DNF/unfinished by distance. */
  standings(): SessionStanding[] {
    const finished = [...this.seats.values()]
      .filter((s) => s.finish && !s.dnf)
      .sort((a, b) => a.finish!.timeMs - b.finish!.timeMs);
    const notFinished = [...this.seats.values()]
      .filter((s) => s.dnf || !s.finish)
      .sort((a, b) => (b.state?.distance ?? 0) - (a.state?.distance ?? 0));
    let place = 0;
    const out: SessionStanding[] = [];
    for (const s of finished) {
      place += 1;
      out.push({
        seatId: s.seatId,
        playerId: s.playerId,
        name: s.name,
        place: s.finish!.place || place,
        distance: s.finish!.distance,
        score: s.finish!.score,
        timeMs: s.finish!.timeMs,
        dnf: false,
      });
    }
    for (const s of notFinished) {
      place += 1;
      out.push({
        seatId: s.seatId,
        playerId: s.playerId,
        name: s.name,
        place: s.finish?.place || place,
        distance: Math.round(s.state?.distance ?? s.finish?.distance ?? 0),
        score: 0,
        timeMs: s.finish?.timeMs ?? null,
        dnf: true,
      });
    }
    return out;
  }

  /**
   * Match token for result submission (short-lived, bound to the player +
   * match). The REST layer verifies it before accepting a race result.
   */
  matchTokenFor(playerId: string): string | null {
    const seat = this.seatsForPlayer(playerId);
    return seat?.matchToken ?? null;
  }

  /* ------------------------------------------------------------- lifecycle */

  /** Drop all seats (suspension / room GC). */
  kickAll(reason: string): void {
    for (const seatId of [...this.seats.keys()]) {
      this.emit({ type: "kicked", seatId, reason });
      this.seats.delete(seatId);
    }
    this.order = [];
    this.hostSeatId = "";
    this.status = "canceled";
    this.sink?.toAll({ type: "error", error: { code: "rejected", message: reason } });
  }

  empty(): boolean {
    return this.seats.size === 0;
  }

  seatCount(): number {
    return this.seats.size;
  }

  /** Read-only seat list for the REST view (never exposes tokens). */
  publicSeats(): Omit<RaceSeat, "reconnectToken" | "matchToken" | "lastSeq" | "inputWindowStart" | "inputWindowCount">[] {
    return [...this.seats.values()].map((s) => ({
      seatId: s.seatId,
      playerId: s.playerId,
      name: s.name,
      skin: s.skin,
      hue: s.hue,
      joinedAt: s.joinedAt,
      generation: s.generation,
      ready: s.ready,
      phase: s.phase,
      state: s.state,
      lastSeenAt: s.lastSeenAt,
      finish: s.finish,
      dnf: s.dnf,
    }));
  }

  lastActivity(): number {
    let last = 0;
    for (const s of this.seats.values()) last = Math.max(last, s.lastSeenAt);
    return last;
  }

  private removeSeat(seatId: string, _reason: string): void {
    if (!this.seats.delete(seatId)) return;
    this.order = this.order.filter((id) => id !== seatId);
    this.finishOrder = this.finishOrder.filter((id) => id !== seatId);
    this.emit({ type: "seatLeft", seatId });
    this.migrateHost();
  }

  private sweepSeats(): void {
    this.seats.clear();
    this.order = [];
    this.hostSeatId = "";
  }

  private touch(seat: RaceSeat): void {
    seat.lastSeenAt = this.opts.now();
  }

  private issueReconnectToken(seat: RaceSeat): string {
    return signReconnectToken(this.opts.tokenSecret, seat.playerId, seat.seatId, seat.generation);
  }

  private scheduleGrace(_seatId: string): void {
    // The tick loop already reaps expired grace windows; this keeps the
    // session alive (unref'd) until then.
    if (this.graceTimer) return;
    this.graceTimer = setTimeout(() => {
      this.graceTimer = null;
    }, this.opts.reconnectGraceMs);
    this.graceTimer.unref?.();
  }

  private emit(ev: SessionEvent): void {
    if (!this.sink) return;
    switch (ev.type) {
      case "roster":
        this.sink.toAll({ type: "roster" });
        break;
      case "started":
        this.sink.toAll({ type: "started", startAtMs: ev.startAtMs, seed: ev.seed });
        break;
      case "snapshot":
        this.sink.toAll({ type: "snapshot", tick: ev.tick, serverTime: ev.serverTime, pilots: ev.pilots });
        break;
      case "finish":
        this.sink.toAll({ type: "finish", seatId: ev.seatId, place: ev.place, timeMs: ev.timeMs, distance: ev.distance });
        break;
      case "seatLeft":
        this.sink.toAll({ type: "left", seatId: ev.seatId });
        break;
      case "emote":
        this.sink.toAll({ type: "emote", seatId: ev.seatId, emote: ev.emote });
        break;
      case "results":
        this.sink.toAll({ type: "results", standings: ev.standings });
        break;
      case "kicked":
        this.sink.toSeat(ev.seatId, { type: "error", error: { code: "rejected", message: ev.reason } });
        break;
    }
  }
}
