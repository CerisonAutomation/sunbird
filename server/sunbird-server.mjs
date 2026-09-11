/**
 * @deprecated EXPERIMENTAL NODE PROTOTYPE — NOT FOR PRODUCTION.
 *
 * The self-hostable production backend now lives in `rust/` (the
 * `sunbird-server` crate serves this exact simple protocol on `GET /ws`),
 * with `backend/` (Cloudflare Workers + Durable Objects) as the managed
 * alternative. This file remains only as a plain-Node protocol reference;
 * it is not part of any deployment artifact.
 *
 *   npm i ws
 *   node server/sunbird-server.mjs
 *   # then build the client with:
 *   #   VITE_MULTIPLAYER_URL=ws://localhost:8787
 *
 * Responsibilities:
 *  • Room management, capacity 40 pilots per room.
 *  • Matchmaking into public rooms when no code is supplied.
 *  • A single 15 Hz broadcast tick per room (NOT per message) so cost scales
 *    with rooms, not with the square of the player count.
 *  • Authoritative finish ordering — clients never decide who won.
 *  • Server-side leaderboard endpoints matching LEADERBOARD_API.md.
 *
 * Deliberately simple: in-memory state, no database. Swap `board` for Redis or
 * Postgres before running this at scale.
 */

import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || 8787);
const CAPACITY = 40;
const TICK_HZ = 15;
const EMPTY_ROOM_TTL_MS = 60_000;
const MAX_NAME = 14;

/* ----------------------------------------------------------------- state */

/** @type {Map<string, Room>} */
const rooms = new Map();
/** In-memory leaderboard: deviceId -> best row. Replace with a real store. */
const board = new Map();

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () =>
  Array.from({ length: 5 }, () => CODE_ALPHABET[(Math.random() * CODE_ALPHABET.length) | 0]).join("");

const todayStr = () => new Date().toISOString().slice(0, 10);
const clean = (v, n) => String(v ?? "").replace(/[<>&"']/g, "").slice(0, n);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

class Room {
  constructor(code, seed, isPublic) {
    this.code = code;
    this.seed = seed || todayStr();
    this.public = isPublic;
    /** @type {Map<string, Pilot>} */
    this.pilots = new Map();
    this.startedAt = 0;
    this.finishOrder = [];
    this.emptySince = Date.now();
    this.timer = setInterval(() => this.tick(), 1000 / TICK_HZ);
  }

  get full() {
    return this.pilots.size >= CAPACITY;
  }

  add(pilot) {
    this.pilots.set(pilot.id, pilot);
    this.emptySince = 0;
    pilot.send({
      type: "welcome",
      id: pilot.id,
      room: this.code,
      seed: this.seed,
      capacity: CAPACITY,
    });
    this.broadcastPeers();
    // A room becomes "racing" as soon as two pilots are present; solo players
    // still fly (against local squadron pilots) with zero waiting.
    if (this.pilots.size >= 2 && !this.startedAt) {
      this.startedAt = Date.now() + 3000;
      this.broadcast({ type: "start", at: this.startedAt, seed: this.seed });
    }
  }

  remove(id) {
    if (!this.pilots.delete(id)) return;
    this.broadcast({ type: "left", id });
    if (this.pilots.size === 0) {
      this.emptySince = Date.now();
      this.startedAt = 0;
      this.finishOrder = [];
    } else {
      this.broadcastPeers();
    }
  }

  broadcastPeers() {
    this.broadcast({
      type: "peers",
      peers: [...this.pilots.values()].map((p) => ({
        id: p.id,
        name: p.name,
        hue: p.hue,
        skin: p.skin,
        ready: p.ready,
      })),
    });
  }

  broadcast(msg, exceptId) {
    const raw = JSON.stringify(msg);
    for (const p of this.pilots.values()) {
      if (p.id === exceptId) continue;
      p.raw(raw);
    }
  }

  /** One packed state frame per tick for the whole room. */
  tick() {
    if (this.pilots.size === 0) {
      if (this.emptySince && Date.now() - this.emptySince > EMPTY_ROOM_TTL_MS) this.close();
      return;
    }
    const pilots = [];
    for (const p of this.pilots.values()) {
      if (!p.hasState) continue;
      pilots.push([p.id, p.x, p.y, p.rot, p.distance]);
    }
    if (pilots.length === 0) return;
    this.broadcast({ type: "state", t: Date.now() / 1000, pilots });
  }

  /** Authoritative: the server assigns finishing places, not the client. */
  finish(pilot, time, distance) {
    if (pilot.finished) return;
    pilot.finished = true;
    pilot.finishTime = time;
    pilot.distance = Math.max(pilot.distance, distance);
    this.finishOrder.push(pilot.id);
    const place = this.finishOrder.length;
    this.broadcast({ type: "finish", id: pilot.id, time, place });
  }

  close() {
    clearInterval(this.timer);
    rooms.delete(this.code);
  }
}

class Pilot {
  constructor(ws, id, name, skin, hue) {
    this.ws = ws;
    this.id = id;
    this.name = name;
    this.skin = skin;
    this.hue = hue;
    this.x = 0;
    this.y = 0;
    this.rot = 0;
    this.distance = 0;
    this.hasState = false;
    this.finished = false;
    this.finishTime = 0;
    this.ready = false;
    this.lastMsg = Date.now();
  }

  send(obj) {
    this.raw(JSON.stringify(obj));
  }

  raw(text) {
    if (this.ws.readyState === 1) {
      try {
        this.ws.send(text);
      } catch {
        /* peer vanished mid-send */
      }
    }
  }
}

function findRoom(code, seed) {
  if (code) {
    let room = rooms.get(code);
    if (!room) {
      room = new Room(code, seed, false);
      rooms.set(code, room);
    }
    return room;
  }
  // Public matchmaking: first room with space on the same seed.
  for (const room of rooms.values()) {
    if (room.public && !room.full && room.seed === (seed || todayStr())) return room;
  }
  const created = new Room(newCode(), seed, true);
  rooms.set(created.code, created);
  return created;
}

/* ------------------------------------------------------------ http + ws */

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.writeHead(204).end();

  if (url.pathname === "/health") {
    return res.writeHead(200, { "content-type": "application/json" }).end(
      JSON.stringify({
        ok: true,
        rooms: rooms.size,
        pilots: [...rooms.values()].reduce((n, r) => n + r.pilots.size, 0),
        scores: board.size,
      }),
    );
  }

  // GET /board?scope=&metric=&device=
  if (url.pathname === "/board" && req.method === "GET") {
    const metric = ["distance", "altitude", "perfects", "coins"].includes(url.searchParams.get("metric"))
      ? url.searchParams.get("metric")
      : "distance";
    const scope = url.searchParams.get("scope") || "global";
    const device = url.searchParams.get("device") || "";
    let rows = [...board.values()];
    if (scope === "daily") rows = rows.filter((r) => r.date === todayStr());
    rows.sort((a, b) => b[metric] - a[metric]);
    const rank = rows.findIndex((r) => r.deviceId === device) + 1;
    return res.writeHead(200, { "content-type": "application/json" }).end(
      JSON.stringify({ entries: rows.slice(0, 50), rank, total: rows.length }),
    );
  }

  // POST /score
  if (url.pathname === "/score" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 4096) req.destroy(); // basic flood guard
    });
    req.on("end", () => {
      try {
        const p = JSON.parse(body);
        const row = {
          deviceId: clean(p.deviceId, 64),
          name: clean(p.name, MAX_NAME) || "Pilot",
          skin: clean(p.skin, 24),
          distance: Math.min(num(p.distance), 500_000),
          altitude: Math.min(num(p.altitude), 10_000),
          perfects: Math.min(num(p.perfects), 5_000),
          coins: Math.min(num(p.coins), 100_000),
          score: Math.min(num(p.score), 5_000_000),
          date: todayStr(),
        };
        if (row.deviceId) {
          const prev = board.get(row.deviceId);
          // Keep the best row per pilot rather than an ever-growing log.
          if (!prev || row.distance > prev.distance) board.set(row.deviceId, row);
        }
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400).end("bad json");
      }
    });
    return undefined;
  }

  return res.writeHead(404).end("not found");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const device = clean(url.searchParams.get("device"), 64) || `anon-${Math.random().toString(36).slice(2, 8)}`;
  const name = clean(url.searchParams.get("name"), MAX_NAME) || "Pilot";
  const skin = clean(url.searchParams.get("skin"), 24) || "sunbird";
  const hue = num(url.searchParams.get("hue"));
  const code = clean(url.searchParams.get("room"), 5).toUpperCase();
  const seed = clean(url.searchParams.get("seed"), 32);

  const room = findRoom(code, seed);
  if (room.full) {
    ws.send(JSON.stringify({ type: "error", message: "That room is full (40 pilots)." }));
    ws.close();
    return;
  }

  const pilot = new Pilot(ws, device, name, skin, hue);
  room.add(pilot);

  ws.on("message", (data) => {
    pilot.lastMsg = Date.now();
    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    switch (msg.type) {
      case "state":
        pilot.x = num(msg.x);
        pilot.y = num(msg.y);
        pilot.rot = num(msg.r);
        pilot.distance = num(msg.d);
        pilot.hasState = true;
        break;
      case "emote":
        room.broadcast({ type: "emote", id: pilot.id, emote: clean(msg.emote, 12) }, pilot.id);
        break;
      case "ready":
        pilot.ready = Boolean(msg.ready);
        room.broadcastPeers();
        break;
      case "finish":
        room.finish(pilot, num(msg.time), num(msg.d));
        break;
      default:
        break;
    }
  });

  ws.on("close", () => room.remove(pilot.id));
  ws.on("error", () => room.remove(pilot.id));
});

// Drop pilots that stopped talking (tab closed without a clean close frame).
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    for (const p of room.pilots.values()) {
      if (now - p.lastMsg > 30_000) {
        try {
          p.ws.close();
        } catch {
          /* ignore */
        }
        room.remove(p.id);
      }
    }
  }
}, 10_000);

server.listen(PORT, () => {
  console.log(`Sunbird race server on :${PORT}`);
  console.log(`  ws   ws://localhost:${PORT}`);
  console.log(`  http http://localhost:${PORT}/health`);
});
