/**
 * Sunbird Social Server — friends, clubs, chat on PGlite.
 *
 * PGlite = full Postgres compiled to WASM, embedded in-process with zero
 * external database to provision (https://pglite.dev). Free, runs anywhere
 * Node runs, persists to disk. Perfect for the social graph while the Rust
 * realtime backend owns racing.
 *
 *   node server/social/social-server.mjs        # listens on :8788
 *
 * REST API (all JSON, CORS *):
 *   POST /register            { deviceId, name }                 → { ok, code }
 *   GET  /profile?device=     → { name, code, friends: [...] }
 *   POST /friends/add         { deviceId, code }                 → { ok, friend }
 *   POST /friends/remove      { deviceId, code }                 → { ok }
 *   GET  /clubs?device=       → { clubs: [...], mine }
 *   POST /clubs/create        { deviceId, name, motto }          → { ok, club }
 *   POST /clubs/join          { deviceId, clubId }               → { ok }
 *   POST /clubs/leave         { deviceId }                       → { ok }
 *   GET  /chat?club=&after=   → { messages: [...] }
 *   POST /chat                { deviceId, text }                 → { ok }
 *   GET  /health              → { ok, players, clubs, messages }
 */

import { PGlite } from "@electric-sql/pglite";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT || 8788);
const DATA_DIR = process.env.PGLITE_DIR || "./sunbird-social-data";
const MAX_NAME = 14;
const MAX_TEXT = 200;
const MAX_FRIENDS = 50;
const CLUB_CAP = 30;

const db = new PGlite(DATA_DIR);

await db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    device_id TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    code      TEXT UNIQUE NOT NULL,
    club_id   INTEGER,
    created   TIMESTAMPTZ DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS friends (
    device_id TEXT NOT NULL,
    friend_id TEXT NOT NULL,
    PRIMARY KEY (device_id, friend_id)
  );
  CREATE TABLE IF NOT EXISTS clubs (
    id     SERIAL PRIMARY KEY,
    name   TEXT NOT NULL,
    motto  TEXT NOT NULL DEFAULT '',
    owner  TEXT NOT NULL,
    created TIMESTAMPTZ DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS messages (
    id      SERIAL PRIMARY KEY,
    club_id INTEGER NOT NULL,
    device_id TEXT NOT NULL,
    name    TEXT NOT NULL,
    text    TEXT NOT NULL,
    at      TIMESTAMPTZ DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_msg_club ON messages(club_id, id);
`);

const clean = (v, n) => String(v ?? "").replace(/[<>&"']/g, "").trim().slice(0, n);

function codeFromId(id) {
  const c = String(id).replace(/[^a-z0-9]/gi, "").toUpperCase();
  return `SUN-${c.slice(-6).padStart(6, "0")}`;
}

async function register(deviceId, name) {
  const code = codeFromId(deviceId);
  await db.query(
    `INSERT INTO players (device_id, name, code) VALUES ($1, $2, $3)
     ON CONFLICT (device_id) DO UPDATE
       SET name = CASE WHEN $2 <> '' AND $2 <> 'Pilot' THEN $2 ELSE players.name END`,
    [deviceId, name || "Pilot", code],
  );
  return code;
}

const routes = {
  "POST /register": async (body) => {
    const deviceId = clean(body.deviceId, 64);
    if (!deviceId) return [400, { error: "deviceId required" }];
    const code = await register(deviceId, clean(body.name, MAX_NAME));
    return [200, { ok: true, code }];
  },

  "GET /profile": async (_b, q) => {
    const device = clean(q.get("device"), 64);
    const me = (await db.query("SELECT * FROM players WHERE device_id = $1", [device])).rows[0];
    if (!me) return [404, { error: "not registered" }];
    const friends = (
      await db.query(
        `SELECT p.name, p.code, p.club_id FROM friends f
         JOIN players p ON p.device_id = f.friend_id WHERE f.device_id = $1 ORDER BY p.name`,
        [device],
      )
    ).rows;
    return [200, { name: me.name, code: me.code, clubId: me.club_id, friends }];
  },

  "POST /friends/add": async (body) => {
    const deviceId = clean(body.deviceId, 64);
    const code = clean(body.code, 16).toUpperCase();
    const target = (await db.query("SELECT * FROM players WHERE code = $1", [code])).rows[0];
    if (!target) return [404, { error: "No pilot with that code" }];
    if (target.device_id === deviceId) return [400, { error: "That's your own code" }];
    const n = (await db.query("SELECT COUNT(*) c FROM friends WHERE device_id = $1", [deviceId])).rows[0].c;
    if (Number(n) >= MAX_FRIENDS) return [400, { error: "Friend list full" }];
    // mutual follow, idempotent
    await db.query("INSERT INTO friends VALUES ($1,$2) ON CONFLICT DO NOTHING", [deviceId, target.device_id]);
    await db.query("INSERT INTO friends VALUES ($1,$2) ON CONFLICT DO NOTHING", [target.device_id, deviceId]);
    return [200, { ok: true, friend: { name: target.name, code: target.code } }];
  },

  "POST /friends/remove": async (body) => {
    const deviceId = clean(body.deviceId, 64);
    const code = clean(body.code, 16).toUpperCase();
    const target = (await db.query("SELECT device_id FROM players WHERE code = $1", [code])).rows[0];
    if (target) {
      await db.query("DELETE FROM friends WHERE (device_id=$1 AND friend_id=$2) OR (device_id=$2 AND friend_id=$1)", [
        deviceId,
        target.device_id,
      ]);
    }
    return [200, { ok: true }];
  },

  "GET /clubs": async (_b, q) => {
    const device = clean(q.get("device"), 64);
    const clubs = (
      await db.query(
        `SELECT c.id, c.name, c.motto, COUNT(p.device_id)::int AS members
         FROM clubs c LEFT JOIN players p ON p.club_id = c.id
         GROUP BY c.id ORDER BY members DESC, c.id LIMIT 50`,
      )
    ).rows;
    const mine = device
      ? ((await db.query("SELECT club_id FROM players WHERE device_id = $1", [device])).rows[0]?.club_id ?? null)
      : null;
    return [200, { clubs, mine }];
  },

  "POST /clubs/create": async (body) => {
    const deviceId = clean(body.deviceId, 64);
    const name = clean(body.name, 24);
    if (!name) return [400, { error: "Club needs a name" }];
    await register(deviceId, clean(body.playerName, MAX_NAME));
    const club = (
      await db.query("INSERT INTO clubs (name, motto, owner) VALUES ($1,$2,$3) RETURNING id, name, motto", [
        name,
        clean(body.motto, 60),
        deviceId,
      ])
    ).rows[0];
    await db.query("UPDATE players SET club_id = $1 WHERE device_id = $2", [club.id, deviceId]);
    return [200, { ok: true, club }];
  },

  "POST /clubs/join": async (body) => {
    const deviceId = clean(body.deviceId, 64);
    const clubId = Number(body.clubId);
    const members = (await db.query("SELECT COUNT(*) c FROM players WHERE club_id = $1", [clubId])).rows[0].c;
    if (Number(members) >= CLUB_CAP) return [400, { error: "Club is full (30)" }];
    await register(deviceId, clean(body.playerName, MAX_NAME));
    await db.query("UPDATE players SET club_id = $1 WHERE device_id = $2", [clubId, deviceId]);
    return [200, { ok: true }];
  },

  "POST /clubs/leave": async (body) => {
    await db.query("UPDATE players SET club_id = NULL WHERE device_id = $1", [clean(body.deviceId, 64)]);
    return [200, { ok: true }];
  },

  "GET /chat": async (_b, q) => {
    const club = Number(q.get("club"));
    const after = Number(q.get("after") || 0);
    const messages = (
      await db.query(
        "SELECT id, name, text, at FROM messages WHERE club_id = $1 AND id > $2 ORDER BY id DESC LIMIT 50",
        [club, after],
      )
    ).rows.reverse();
    return [200, { messages }];
  },

  "POST /chat": async (body) => {
    const deviceId = clean(body.deviceId, 64);
    const text = clean(body.text, MAX_TEXT);
    if (!text) return [400, { error: "empty message" }];
    const me = (await db.query("SELECT name, club_id FROM players WHERE device_id = $1", [deviceId])).rows[0];
    if (!me?.club_id) return [400, { error: "join a club first" }];
    await db.query("INSERT INTO messages (club_id, device_id, name, text) VALUES ($1,$2,$3,$4)", [
      me.club_id,
      deviceId,
      me.name,
      text,
    ]);
    return [200, { ok: true }];
  },

  "GET /health": async () => {
    const [p, c, m] = await Promise.all([
      db.query("SELECT COUNT(*)::int n FROM players"),
      db.query("SELECT COUNT(*)::int n FROM clubs"),
      db.query("SELECT COUNT(*)::int n FROM messages"),
    ]);
    return [200, { ok: true, engine: "pglite", players: p.rows[0].n, clubs: c.rows[0].n, messages: m.rows[0].n }];
  },
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const headers = {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  };
  if (req.method === "OPTIONS") {
    res.writeHead(204, headers);
    return res.end();
  }
  const handler = routes[`${req.method} ${url.pathname}`];
  if (!handler) {
    res.writeHead(404, headers);
    return res.end(JSON.stringify({ error: "not found" }));
  }
  let body = {};
  if (req.method === "POST") {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 4096) {
        res.writeHead(413, headers);
        return res.end(JSON.stringify({ error: "too large" }));
      }
    }
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      res.writeHead(400, headers);
      return res.end(JSON.stringify({ error: "bad json" }));
    }
  }
  try {
    const [status, payload] = await handler(body, url.searchParams);
    res.writeHead(status, headers);
    res.end(JSON.stringify(payload));
  } catch (err) {
    console.error(err);
    res.writeHead(500, headers);
    res.end(JSON.stringify({ error: "internal" }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Sunbird social server (PGlite) on http://0.0.0.0:${PORT} · data: ${DATA_DIR}`);
});
