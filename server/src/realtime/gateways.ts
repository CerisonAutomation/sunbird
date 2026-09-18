/**
 * WebSocket gateways.
 *
 * Two transports over the same authoritative RaceSession:
 *
 *  1. protocol v1 (`/mp/v1/rooms/ws?token=…`)
 *     Versioned lifecycle frames (hello, welcome, rosterUpdate, started,
 *     snapshot, error) per protocol/contract.json, plus the legacy event
 *     frames (finish, emote, results) which have no v1 variant yet.
 *
 *  2. legacy (`/mp?device=…&room=…`, `/ws?…`, `/mp/rooms/:code/ws?…` —
 *     the shipped client + reference-server bots)
 *     Unversioned frames: welcome/peers/left/state/emote/finish/start/error
 *     — byte-compatible with server/sunbird-server.mjs.
 *
 * A room can host sockets from BOTH transports (and many sockets): each
 * session gets ONE fan-out sink that renders its raw events per-client into
 * the right wire dialect.
 *
 * Enforced on every socket: 8 KB payload cap, per-socket message rate,
 * server-side input validation (via RaceSession), platform mutes for
 * emotes, and 30 s silence reaping.
 */
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { WebSocketServer as WSServer, WebSocket as WSocket } from "ws";
import type { WebSocket } from "ws";

import type { Ctx } from "../core/ctx.js";
import { HttpError, cleanText } from "../util/http.js";
import { devicePlayer } from "../http/router.js";
import { dailySeed } from "../util/id.js";
import type { RaceSession } from "./race-session.js";

const PROTO_VERSION = 1;
const MAX_JSON_PAYLOAD_BYTES = 8 * 1024;
const MAX_NAME = 14;
const MAX_MSGS_PER_SEC = 60;
const SILENCE_MS = 30_000;
const REAP_PERIOD_MS = 10_000;
const EMOTE_COOLDOWN_MS = 1_000;

/* ------------------------------------------------------------------ types */

type RoomPublic = {
  id: string;
  code: string;
  seed: string;
  capacity: number;
  hostSeatId: string;
  pilots: { id: string; name: string; skin: string; ready: boolean; reconnecting: boolean; joinedAt?: string }[];
};

/**
 * Everything the session sink needs to reach one socket. `render` turns a
 * broadcast event into wire frames for this transport; `toSelf` handles
 * seat-targeted frames (kick errors).
 */
type GatewayClient = {
  ws: WebSocket;
  playerId: string | null;
  seatId: string | null;
  session: RaceSession | null;
  seq: number;
  msgWindowStart: number;
  msgWindowCount: number;
  lastMsg: number;
  lastEmote: number;
  closed: boolean;
  render: (frame: Record<string, unknown>) => void;
  toSelf: (frame: Record<string, unknown>) => void;
};

const registry = new Set<GatewayClient>();
/** One fan-out sink per session (sessions serve multiple sockets). */
const sinks = new Map<RaceSession, Set<GatewayClient>>;

function attachToSession(session: RaceSession, client: GatewayClient): void {
  const existing = sinks.get(session);
  if (existing) {
    existing.add(client);
    return;
  }
  const set = new Set<GatewayClient>();
  set.add(client);
  sinks.set(session, set);
  session.attach({
    toSeat(seatId, frame) {
      for (const c of set) if (c.seatId === seatId) c.toSelf(frame as Record<string, unknown>);
    },
    toAll(frame) {
      for (const c of set) c.render(frame as Record<string, unknown>);
    },
  });
}

function detachFromSession(client: GatewayClient): void {
  if (!client.session) return;
  const set = sinks.get(client.session);
  if (set) {
    set.delete(client);
    if (set.size === 0) {
      sinks.delete(client.session);
      client.session.detach();
    }
  }
}

function sendJson(ws: WebSocket, frame: Record<string, unknown>): void {
  if (ws.readyState === WSocket.OPEN) {
    try {
      ws.send(JSON.stringify(frame));
    } catch {
      /* peer gone */
    }
  }
}

/* ------------------------------------------------------------------ setup */

export function attachGateways(
  ctx: Ctx,
  server: { on(event: "upgrade", listener: (req: IncomingMessage, socket: Socket, head: Buffer) => void): void },
): () => void {
  const wss = new WSServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    let url: URL;
    try {
      url = new URL(req.url ?? "/", "http://internal");
    } catch {
      socket.destroy();
      return;
    }
    const path = url.pathname;
    const isV1 = path === "/mp/v1/rooms/ws";
    const isLegacy =
      path === "/mp" ||
      path === "/" ||
      path === "/ws" ||
      /^\/mp\/rooms\/[A-Z0-9]{5}\/(ws|gateway)$/.test(path);
    if (!isV1 && !isLegacy) {
      try {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      } catch {
        /* socket already gone */
      }
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket as never, head, (ws) => {
      if (isV1) handleV1(ctx, ws, url);
      else handleLegacy(ctx, ws, url);
    });
  });

  const housekeeping = setInterval(() => {
    for (const c of [...registry]) reapSilent(ctx, c);
  }, REAP_PERIOD_MS);
  housekeeping.unref?.();

  return () => {
    clearInterval(housekeeping);
    wss.close();
  };
}

/* ------------------------------------------------------------------ v1 ws */

function handleV1(ctx: Ctx, ws: WebSocket, url: URL): void {
  const token = url.searchParams.get("token") ?? "";
  const client: GatewayClient = {
    ws,
    playerId: null,
    seatId: null,
    session: null,
    seq: 0,
    msgWindowStart: Date.now(),
    msgWindowCount: 0,
    lastMsg: Date.now(),
    lastEmote: 0,
    closed: false,
    render: (f) => renderV1(client, f),
    toSelf: (f) => {
      if (f.type === "error") sendJson(ws, errFrame({ code: "rejected", message: String((f.error as { message?: string })?.message ?? "kicked") }));
    },
  };
  // Pre-authenticate the session token (query param, not a header — the
  // browser WebSocket API cannot set Authorization headers).
  client.playerId =
    typeof token === "string" && token.length >= 16 ? ctx.trust.verifySession(token, (t) => ctx.identity.isRevoked(t)) : null;

  registry.add(client);
  sendJson(ws, {
    type: "hello",
    version: PROTO_VERSION,
    serverName: ctx.cfg.serverName,
    limits: { version: PROTO_VERSION, maxJsonPayloadBytes: MAX_JSON_PAYLOAD_BYTES, maxNameChars: MAX_NAME },
  });

  ws.on("message", (data) => {
    try {
      const text = String(data);
      if (Buffer.byteLength(text, "utf8") > MAX_JSON_PAYLOAD_BYTES) {
        sendJson(ws, errFrame({ code: "payloadTooLarge", maxBytes: MAX_JSON_PAYLOAD_BYTES }));
        return;
      }
      if (!rateOk(client, MAX_MSGS_PER_SEC)) {
        sendJson(ws, errFrame({ code: "rateLimited", retryAfterMs: 1_000 }));
        return;
      }
      const msg = JSON.parse(text) as Record<string, unknown>;
      client.lastMsg = Date.now();
      handleV1Frame(ctx, client, msg);
    } catch {
      sendJson(ws, errFrame({ code: "invalidMessage", reason: "malformed frame" }));
    }
  });

  const onGone = () => {
    client.closed = true;
    if (client.session && client.seatId) {
      const seat = client.session.seat(client.seatId);
      if (seat && seat.phase === "connected") client.session.markDisconnected(client.seatId);
    }
    detachFromSession(client);
    registry.delete(client);
  };
  ws.on("close", onGone);
  ws.on("error", onGone);
}

function handleV1Frame(ctx: Ctx, client: GatewayClient, msg: Record<string, unknown>): void {
  const ws = client.ws;
  const type = msg.type;
  const version = msg.version;

  // Legacy frames (no version) ride the v1 socket too.
  if (version === undefined) {
    if (type === "state" && client.session && client.seatId) return handleInput(ctx, client, msg);
    if (type === "finish" && client.session && client.seatId) return handleFinish(client, msg);
    if (type === "emote" && client.session && client.seatId) return handleEmote(ctx, client, msg);
    if (type === "ready" && client.session && client.seatId) {
      try {
        client.session.ready(client.seatId, msg.ready === true);
      } catch {
        sendJson(ws, errFrame({ code: "seatNotFound" }));
      }
      return;
    }
    sendJson(ws, errFrame({ code: "invalidMessage", reason: `unversioned frame ${String(type)} not supported` }));
    return;
  }
  if (version !== PROTO_VERSION) {
    sendJson(ws, errFrame({ code: "unsupportedVersion", version: Number(version), minSupported: PROTO_VERSION }));
    return;
  }

  switch (type) {
    case "join": {
      try {
        if (!client.playerId) throw new HttpError(401, "authentication required", "unauthorized");
        const playerId = client.playerId;
        if (ctx.identity.isSuspended(playerId)) {
          sendJson(ws, errFrame({ code: "rejected", message: "account suspended" }));
          ws.close();
          return;
        }
        const profile = ctx.identity.requireProfile(playerId);
        const name = cleanText(msg.name, MAX_NAME) || profile.displayName;
        const skin = cleanText(msg.skin, 32) || "sunbird";
        const seed = typeof msg.seed === "string" ? msg.seed.slice(0, 64) : "";
        const roomCode = typeof msg.roomCode === "string" && msg.roomCode ? msg.roomCode.toUpperCase() : "";

        let session: RaceSession;
        if (roomCode) {
          if (!ctx.rooms.session(roomCode)) throw new HttpError(404, "room not found", "roomNotFound");
          session = ctx.rooms.byCode(roomCode);
        } else {
          const mm = ctx.rooms.matchmake({ playerId, name, skin, seed: seed || undefined });
          session = ctx.rooms.byCode(mm.room.code);
        }
        const { seat } = session.join({
          playerId,
          name,
          skin,
          hue: 0.06,
          reconnectToken: typeof msg.reconnectToken === "string" && msg.reconnectToken ? msg.reconnectToken : undefined,
          seatId: typeof msg.seatId === "string" ? msg.seatId : undefined,
        });
        client.session = session;
        client.seatId = seat.seatId;
        attachToSession(session, client);
        sendJson(ws, {
          type: "welcome",
          version: PROTO_VERSION,
          grant: {
            roomId: session.id,
            seatId: seat.seatId,
            playerId,
            generation: seat.generation,
            reconnectToken: seat.reconnectToken,
          },
          room: toRoomPublic(session),
        });
      } catch (err) {
        sendJson(ws, joinError(err));
      }
      return;
    }
    case "ready": {
      if (!client.session || !client.seatId) return sendJson(ws, errFrame({ code: "seatNotFound" }));
      try {
        client.session.ready(client.seatId, msg.ready === true);
      } catch {
        sendJson(ws, errFrame({ code: "seatNotFound" }));
      }
      return;
    }
    case "heartbeat": {
      if (!client.session || !client.seatId) return sendJson(ws, errFrame({ code: "seatNotFound" }));
      const res = client.session.heartbeat(client.seatId, Number(msg.sequence));
      if (!res.accepted) sendJson(ws, errFrame({ code: "invalidMessage", reason: res.violation?.detail ?? "heartbeat rejected" }));
      return;
    }
    case "reconnect": {
      if (!client.playerId) return sendJson(ws, errFrame({ code: "invalidReconnectToken" }));
      const seatId = typeof msg.seatId === "string" ? msg.seatId : "";
      const token = typeof msg.reconnectToken === "string" ? msg.reconnectToken : "";
      const session = client.session;
      if (!session || !seatId || !token) return sendJson(ws, errFrame({ code: "invalidReconnectToken" }));
      try {
        const { seat } = session.join({
          playerId: client.playerId,
          name: "",
          skin: "",
          hue: 0,
          seatId,
          reconnectToken: token,
        });
        client.seatId = seat.seatId;
        attachToSession(session, client);
        sendJson(ws, {
          type: "welcome",
          version: PROTO_VERSION,
          grant: {
            roomId: session.id,
            seatId: seat.seatId,
            playerId: client.playerId,
            generation: seat.generation,
            reconnectToken: seat.reconnectToken,
          },
          room: toRoomPublic(session),
        });
      } catch {
        sendJson(ws, errFrame({ code: "invalidReconnectToken" }));
      }
      return;
    }
    case "leave": {
      if (client.session && client.seatId) client.session.leave(client.seatId);
      client.session = null;
      client.seatId = null;
      detachFromSession(client);
      ws.close();
      return;
    }
    default:
      sendJson(ws, errFrame({ code: "invalidMessage", reason: `unknown frame ${String(type)}` }));
  }
}

function joinError(err: unknown): Record<string, unknown> {
  const e = err as Error;
  if (err instanceof HttpError) {
    if (err.code === "roomNotFound") return errFrame({ code: "roomNotFound" });
    if (err.status === 401) return errFrame({ code: "rejected", message: "authentication required" });
    if (err.status === 403) return errFrame({ code: "rejected", message: err.message });
  }
  if (e.message === "roomFull") return errFrame({ code: "roomFull" });
  if (e.message === "invalidReconnectToken") return errFrame({ code: "invalidReconnectToken" });
  if (e.message === "seatOccupied") return errFrame({ code: "rejected", message: "seat is taken" });
  if (e.message === "roomClosed") return errFrame({ code: "roomNotFound" });
  return errFrame({ code: "rejected", message: "join failed" });
}

function renderV1(client: GatewayClient, f: Record<string, unknown>): void {
  const session = client.session;
  if (!session) return;
  switch (f.type) {
    case "roster":
    case "left":
      sendJson(client.ws, { type: "rosterUpdate", version: PROTO_VERSION, room: toRoomPublic(session) });
      break;
    case "started":
      sendJson(client.ws, {
        type: "started",
        version: PROTO_VERSION,
        roomId: session.id,
        startAt: new Date(f.startAtMs as number).toISOString(),
        seed: f.seed,
      });
      break;
    case "snapshot":
      sendJson(client.ws, {
        type: "snapshot",
        version: PROTO_VERSION,
        snapshot: { serverTime: f.serverTime, tick: f.tick, pilots: f.pilots },
      });
      break;
    case "finish":
      // Legacy event frame (no v1 variant in the contract yet).
      sendJson(client.ws, { type: "finish", id: f.seatId, time: f.timeMs, place: f.place });
      break;
    case "emote":
      sendJson(client.ws, { type: "emote", id: f.seatId, emote: f.emote });
      break;
    case "results":
      // Extension frame: final standings (unversioned, additive).
      sendJson(client.ws, { type: "results", standings: f.standings });
      break;
    default:
      break;
  }
}

/* ------------------------------------------------------------ legacy ws */

function handleLegacy(ctx: Ctx, ws: WebSocket, url: URL): void {
  const device = cleanText(url.searchParams.get("device"), 64) || `anon-${Math.random().toString(36).slice(2, 8)}`;
  const name = cleanText(url.searchParams.get("name"), MAX_NAME) || "Pilot";
  const skin = cleanText(url.searchParams.get("skin"), 24) || "sunbird";
  const hue = Number(url.searchParams.get("hue"));
  const code = cleanText(url.searchParams.get("room"), 5).toUpperCase();
  const seedParam = cleanText(url.searchParams.get("seed"), 32);

  const client: GatewayClient = {
    ws,
    playerId: null,
    seatId: null,
    session: null,
    seq: 0,
    msgWindowStart: Date.now(),
    msgWindowCount: 0,
    lastMsg: Date.now(),
    lastEmote: 0,
    closed: false,
    render: (f) => renderLegacy(client, f),
    toSelf: (f) => {
      if (f.type === "error") {
        sendJson(ws, { type: "error", message: String((f.error as { message?: string })?.message ?? "kicked") });
        try {
          ws.close();
        } catch {
          /* gone */
        }
      }
    },
  };
  registry.add(client);

  try {
    client.playerId = devicePlayer(ctx, device);
    if (ctx.identity.isSuspended(client.playerId)) {
      sendJson(ws, { type: "error", message: "account suspended" });
      ws.close();
      return;
    }
    // Legacy auto-creates the room on connect (shipped client behaviour).
    const seed = seedParam || dailySeed(ctx.now());
    const session = code ? ctx.rooms.createForGateway(code, seed) : legacyMatchmake(ctx, client, name, skin, hue, seed);
    const { seat } = session.join({
      playerId: client.playerId,
      name,
      skin,
      hue: Number.isFinite(hue) ? hue : 0.06,
    });
    client.session = session;
    client.seatId = seat.seatId;
    attachToSession(session, client);
    sendJson(ws, { type: "welcome", id: client.seatId, room: session.code, seed: session.seed, capacity: session.capacity });
    renderLegacy(client, { type: "roster" });
  } catch (err) {
    const e = err as Error;
    sendJson(ws, { type: "error", message: e.message === "roomFull" ? "That room is full (40 pilots)." : "join failed" });
    ws.close();
    return;
  }

  ws.on("message", (data) => {
    try {
      const text = String(data);
      if (Buffer.byteLength(text, "utf8") > MAX_JSON_PAYLOAD_BYTES) return;
      if (!rateOk(client, MAX_MSGS_PER_SEC)) return;
      const msg = JSON.parse(text) as Record<string, unknown>;
      client.lastMsg = Date.now();
      if (client.session && client.seatId) client.session.poke(client.seatId);
      handleLegacyFrame(ctx, client, msg);
    } catch {
      /* non-JSON legacy traffic is ignored (parity with reference server) */
    }
  });

  const onGone = () => {
    client.closed = true;
    if (client.session && client.seatId) {
      const seat = client.session.seat(client.seatId);
      if (seat && seat.phase === "connected") client.session.markDisconnected(client.seatId);
    }
    detachFromSession(client);
    registry.delete(client);
  };
  ws.on("close", onGone);
  ws.on("error", onGone);
}

function legacyMatchmake(ctx: Ctx, client: GatewayClient, name: string, skin: string, hue: number, seed: string): RaceSession {
  const mm = ctx.rooms.matchmake({ playerId: client.playerId!, name, skin, hue, seed });
  return ctx.rooms.byCode(mm.room.code);
}

function handleLegacyFrame(ctx: Ctx, client: GatewayClient, msg: Record<string, unknown>): void {
  switch (msg.type) {
    case "state":
      return handleInput(ctx, client, msg);
    case "finish":
      return handleFinish(client, msg);
    case "emote":
      return handleEmote(ctx, client, msg);
    case "ready": {
      if (!client.session || !client.seatId) return;
      try {
        client.session.ready(client.seatId, msg.ready === true);
      } catch {
        /* seat already gone */
      }
      return;
    }
    case "leave": {
      // Explicit departure ("Leave room" / switching rooms): free the seat now
      // instead of holding it for the reconnect grace window, so the room's
      // roster and pilot count tell the truth immediately.
      if (!client.session || !client.seatId) return;
      try {
        client.session.leave(client.seatId);
      } catch {
        /* seat already gone */
      }
      client.seatId = null;
      return;
    }
    default:
      return;
  }
}

function renderLegacy(client: GatewayClient, f: Record<string, unknown>): void {
  const session = client.session;
  if (!session) return;
  switch (f.type) {
    case "roster":
    case "left":
      sendJson(client.ws, {
        type: "peers",
        peers: session.publicSeats().map((s) => ({ id: s.seatId, name: s.name, hue: s.hue, skin: s.skin, ready: s.ready })),
      });
      break;
    case "started":
      sendJson(client.ws, { type: "start", at: f.startAtMs, seed: f.seed });
      break;
    case "snapshot":
      sendJson(client.ws, {
        type: "state",
        t: Date.now() / 1000,
        pilots: (f.pilots as { seatId: string; x: number; y: number; rotation: number; distance: number }[]).map((p) => [
          p.seatId,
          p.x,
          p.y,
          p.rotation,
          p.distance,
        ]),
      });
      break;
    case "finish":
      sendJson(client.ws, { type: "finish", id: f.seatId, time: f.timeMs, place: f.place });
      break;
    case "emote":
      sendJson(client.ws, { type: "emote", id: f.seatId, emote: f.emote });
      break;
    default:
      break;
  }
}

/* ------------------------------------------------- shared frame handlers */

function handleInput(ctx: Ctx, client: GatewayClient, msg: Record<string, unknown>): void {
  if (!client.session || !client.seatId) return;
  const x = Number(msg.x);
  const y = Number(msg.y);
  const rot = Number(msg.r ?? msg.rot);
  const d = Number(msg.d ?? msg.distance);
  if (![x, y, rot, d].every(Number.isFinite)) return;
  client.seq += 1;
  const res = client.session.input(client.seatId, client.seq, x, y, rot, d);
  if (!res.accepted && res.violation && (res.violation.kind === "bounds" || res.violation.kind === "regression")) {
    ctx.audit.log(client.playerId ?? "anon", "room.input_rejected", res.violation.kind, { detail: res.violation.detail });
  }
}

function handleFinish(client: GatewayClient, msg: Record<string, unknown>): void {
  if (!client.session || !client.seatId) return;
  const time = Number(msg.time);
  const d = Number(msg.d);
  client.session.finish(client.seatId, Number.isFinite(time) ? time : 0, Number.isFinite(d) ? d : 0);
}

function handleEmote(ctx: Ctx, client: GatewayClient, msg: Record<string, unknown>): void {
  if (!client.session || !client.seatId) return;
  const now = Date.now();
  if (now - client.lastEmote < EMOTE_COOLDOWN_MS) return;
  if (client.playerId && ctx.identity.isMuted(client.playerId)) return; // platform mute
  client.lastEmote = now;
  client.session.emote(client.seatId, cleanText(msg.emote, 12));
}

/* ---------------------------------------------------------------- helpers */

function toRoomPublic(session: RaceSession): RoomPublic {
  return {
    id: session.id,
    code: session.code,
    seed: session.seed,
    capacity: session.capacity,
    hostSeatId: session.hostSeatId,
    pilots: session.publicSeats().map((s) => ({
      id: s.seatId,
      name: s.name,
      skin: s.skin,
      ready: s.ready,
      reconnecting: s.phase === "reconnecting",
      joinedAt: s.joinedAt,
    })),
  };
}

function errFrame(error: Record<string, unknown>): Record<string, unknown> {
  return { type: "error", version: PROTO_VERSION, error };
}

function rateOk(c: GatewayClient, perSec: number): boolean {
  const now = Date.now();
  if (now - c.msgWindowStart > 1000) {
    c.msgWindowStart = now;
    c.msgWindowCount = 0;
  }
  c.msgWindowCount += 1;
  return c.msgWindowCount <= perSec;
}

function reapSilent(_ctx: Ctx, c: GatewayClient): void {
  if (c.closed) return;
  if (Date.now() - c.lastMsg > SILENCE_MS && c.session && c.seatId) {
    const seat = c.session.seat(c.seatId);
    if (seat && seat.phase === "connected") c.session.markDisconnected(c.seatId);
    try {
      c.ws.close(4000, "heartbeat timeout");
    } catch {
      /* gone */
    }
  }
}
