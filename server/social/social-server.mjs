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
 * REST API (JSON; same-origin by default, SOCIAL_ALLOWED_ORIGINS for CORS):
 * All non-health requests require a separate Bearer capability. Existing
 * unauthenticated databases require a trusted migration; see docs/CONSOLIDATION_AUDIT.md.
 *   POST /register            { deviceId, name }                 → { ok, code }
 *   GET  /profile?device=     → { name, code, friends: [...] }
 *   POST /friends/add         { deviceId, code }                 → { ok, friend }
 *   POST /friends/remove      { deviceId, code }                 → { ok }
 *   GET  /clubs?device=       → { clubs: [...], mine }
 *   POST /clubs/create        { deviceId, name, motto }          → { ok, club }
 *   POST /clubs/join          { deviceId, clubId }               → { ok }
 *   POST /clubs/leave         { deviceId }                       → { ok }
 *   GET  /chat?device=&club=&after=   → { messages: [...] }
 *   POST /chat                { deviceId, text }                 → { ok }
 *   GET  /health              → { ok, players, clubs, messages }
 */

import { PGlite } from "@electric-sql/pglite";
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT || 8788);
const DATA_DIR = process.env.PGLITE_DIR || "./sunbird-social-data";
const MAX_NAME = 14;
const MAX_TEXT = 200;
const MAX_FRIENDS = 50;
const CLUB_CAP = 30;
const ORIGINS = new Set((process.env.SOCIAL_ALLOWED_ORIGINS || "").split(",").filter(Boolean));

if (DATA_DIR !== "memory://") mkdirSync(DATA_DIR, { recursive: true });
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
  ALTER TABLE players ADD COLUMN IF NOT EXISTS auth_hash TEXT;
`);

const clean = (v, n) => String(v ?? "").replace(/[<>&"']/g, "").trim().slice(0, n);

const tokenHash = token => createHash("sha256").update(token).digest("hex");

async function register(deviceId, name, hash) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = `SUN-${randomBytes(3).toString("hex").toUpperCase()}`;
    try {
      const result = await db.query(
        `INSERT INTO players (device_id, name, code, auth_hash) VALUES ($1,$2,$3,$4)
         ON CONFLICT (device_id) DO UPDATE SET name = CASE WHEN $2 <> '' AND $2 <> 'Pilot' THEN $2 ELSE players.name END
         WHERE players.auth_hash = $4 RETURNING code`,
        [deviceId, name || "Pilot", code, hash],
      );
      return result.rows[0]?.code;
    } catch (error) { if (error.code !== "23505" || attempt === 3) throw error; }
  }
}

const routes = {
  "POST /register": async (body, _q, hash) => {
    const deviceId = clean(body.deviceId, 64);
    if (!deviceId) return [400, { error: "deviceId required" }];
    const code = await register(deviceId, clean(body.name, MAX_NAME), hash);
    if (!code) return [403, { error: "Squad identity could not be verified" }];
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
    // Private, one-way saved-pilot list. Adding someone must not edit their list.
    await db.query("INSERT INTO friends VALUES ($1,$2) ON CONFLICT DO NOTHING", [deviceId, target.device_id]);
    return [200, { ok: true, friend: { name: target.name, code: target.code } }];
  },

  "POST /friends/remove": async (body) => {
    const deviceId = clean(body.deviceId, 64);
    const code = clean(body.code, 16).toUpperCase();
    const target = (await db.query("SELECT device_id FROM players WHERE code = $1", [code])).rows[0];
    if (target) {
      await db.query("DELETE FROM friends WHERE device_id=$1 AND friend_id=$2", [
        deviceId,
        target.device_id,
      ]);
    }
    return [200, { ok: true }];
  },

  "GET /clubs": async (_b, q) => {
    const device = clean(q.get("device"), 64);
    const mine = device
      ? ((await db.query("SELECT club_id FROM players WHERE device_id = $1", [device])).rows[0]?.club_id ?? null)
      : null;
    const clubs = (
      await db.query(
        `SELECT c.id, c.name, c.motto, COUNT(p.device_id)::int AS members
         FROM clubs c LEFT JOIN players p ON p.club_id = c.id
         GROUP BY c.id ORDER BY (c.id = $1) DESC NULLS LAST, members DESC, c.id LIMIT 50`,
        [mine],
      )
    ).rows;
    return [200, { clubs, mine }];
  },

  "POST /clubs/create": async (body) => {
    const deviceId = clean(body.deviceId, 64);
    const name = clean(body.name, 24);
    if (!name) return [400, { error: "Club needs a name" }];
    return db.transaction(async tx => {
      const current = (await tx.query("SELECT club_id FROM players WHERE device_id=$1 FOR UPDATE", [deviceId])).rows[0];
      if (current?.club_id) return [409, { error: "Leave your current club first" }];
      const club = (await tx.query("INSERT INTO clubs (name,motto,owner) VALUES ($1,$2,$3) RETURNING id,name,motto", [name, clean(body.motto,60), deviceId])).rows[0];
      await tx.query("UPDATE players SET club_id=$1 WHERE device_id=$2", [club.id, deviceId]);
      return [200, { ok: true, club }];
    });
  },

  "POST /clubs/join": async (body) => {
    const deviceId = clean(body.deviceId, 64);
    const clubId = Number(body.clubId);
    if (!Number.isSafeInteger(clubId) || clubId < 1) return [400, { error: "Invalid club" }];
    return db.transaction(async tx => {
      const club = (await tx.query("SELECT id FROM clubs WHERE id=$1 FOR UPDATE", [clubId])).rows[0];
      if (!club) return [404, { error: "Club no longer exists" }];
      const me = (await tx.query("SELECT club_id FROM players WHERE device_id=$1 FOR UPDATE", [deviceId])).rows[0];
      if (me?.club_id === clubId) return [200, { ok: true }];
      if (me?.club_id) return [409, { error: "Leave your current club first" }];
      const members = (await tx.query("SELECT COUNT(*) c FROM players WHERE club_id=$1", [clubId])).rows[0].c;
      if (Number(members) >= CLUB_CAP) return [400, { error: "Club is full (30)" }];
      await tx.query("UPDATE players SET club_id=$1 WHERE device_id=$2", [clubId, deviceId]);
      return [200, { ok: true }];
    });
  },

  "POST /clubs/leave": async (body) => {
    await db.query("UPDATE players SET club_id = NULL WHERE device_id = $1", [clean(body.deviceId, 64)]);
    return [200, { ok: true }];
  },

  "GET /chat": async (_b, q) => {
    const club = Number(q.get("club"));
    const after = Number(q.get("after") || 0);
    if (!Number.isSafeInteger(club) || club < 1 || !Number.isSafeInteger(after) || after < 0) return [400, { error: "Invalid chat cursor" }];
    const me = (await db.query("SELECT club_id FROM players WHERE device_id=$1", [clean(q.get("device"), 64)])).rows[0];
    if (me?.club_id !== club) return [403, { error: "Join this club to read its chat" }];
    const messages = (
      await db.query(
        `SELECT id, name, text, at FROM messages WHERE club_id = $1 AND id > $2 ORDER BY id ${after > 0 ? "ASC" : "DESC"} LIMIT 50`,
        [club, after],
      )
    ).rows;
    if (!after) messages.reverse();
    return [200, { messages }];
  },

  "POST /chat": async (body) => {
    const deviceId = clean(body.deviceId, 64);
    const text = clean(body.text, MAX_TEXT);
    if (!text) return [400, { error: "empty message" }];
    const me = (await db.query("SELECT name, club_id FROM players WHERE device_id = $1", [deviceId])).rows[0];
    if (!me?.club_id) return [400, { error: "join a club first" }];
    const inserted = await db.query("INSERT INTO messages (club_id, device_id, name, text) VALUES ($1,$2,$3,$4) RETURNING id,name,text,at", [
      me.club_id,
      deviceId,
      me.name,
      text,
    ]);
    return [200, { ok: true, message: inserted.rows[0] }];
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

// Bounded burst protection; deployments should also enforce edge quotas.
const buckets = new Map();
function allow(key, limit) {
  const now = Date.now();
  let entry = buckets.get(key);
  if (!entry || entry.until <= now) {
    if (buckets.size >= 4096) {
      for (const [id, value] of buckets) if (value.until <= now) buckets.delete(id);
      if (buckets.size >= 4096 && !entry) return false;
    }
    entry = { count: 0, until: now + 60000 }; buckets.set(key, entry);
  }
  return ++entry.count <= limit;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const headers = {
    "content-type": "application/json",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  };
  if (ORIGINS.has(req.headers.origin)) headers["access-control-allow-origin"] = req.headers.origin;
  if (req.method === "OPTIONS") {
    res.writeHead(204, headers);
    return res.end();
  }
  const capability = String(req.headers.authorization || "");
  if (url.pathname !== "/health" && (!allow(`ip:${req.socket.remoteAddress}`, 1200) || !allow(`key:${tokenHash(capability)}`, 180))) {
    res.writeHead(429, { ...headers, "retry-after": "60" });
    return res.end(JSON.stringify({ error: "Too many Squad requests. Wait a minute and retry." }));
  }
  const handler = routes[`${req.method} ${url.pathname}`];
  if (!handler) {
    res.writeHead(404, headers);
    return res.end(JSON.stringify({ error: "not found" }));
  }
  let body = {};
  if (req.method === "POST") {
    let raw = "";
    try { for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 4096) {
        res.writeHead(413, headers);
        return res.end(JSON.stringify({ error: "too large" }));
      }
    }
    } catch { if (!res.destroyed) { res.writeHead(400, headers); res.end(JSON.stringify({ error: "Request interrupted" })); } return; }
    try {
      body = raw ? JSON.parse(raw) : {};
      if (!body || Array.isArray(body) || typeof body !== "object") throw new Error("invalid body");
    } catch {
      res.writeHead(400, headers);
      return res.end(JSON.stringify({ error: "bad json" }));
    }
  }
  try {
    let hash = "";
    if (url.pathname !== "/health") {
      const token = /^Bearer ([a-f0-9]{64})$/.exec(String(req.headers.authorization || ""))?.[1];
      const device = clean(req.method === "POST" ? body.deviceId : url.searchParams.get("device"), 64);
      if (!token || !device) {
        res.writeHead(401, headers); return res.end(JSON.stringify({ error: "Squad identity required. Refresh to connect." }));
      }
      hash = tokenHash(token);
      const existing = (await db.query("SELECT auth_hash FROM players WHERE device_id=$1", [device])).rows[0];
      if (existing && (!existing.auth_hash || !timingSafeEqual(Buffer.from(existing.auth_hash), Buffer.from(hash)))) {
        res.writeHead(403, headers);
        return res.end(JSON.stringify({ error: existing.auth_hash ? "Squad identity could not be verified on this browser." : "This legacy Squad profile needs administrator migration. Your game progress is unchanged." }));
      }
      if (!existing && url.pathname !== "/register") {
        res.writeHead(401, headers); return res.end(JSON.stringify({ error: "Refresh Squad before continuing." }));
      }
    }
    const [status, payload] = await handler(body, url.searchParams, hash);
    res.writeHead(status, headers);
    res.end(JSON.stringify(payload));
  } catch (err) {
    console.error(err);
    res.writeHead(500, headers);
    res.end(JSON.stringify({ error: "internal" }));
  }
});

server.requestTimeout = 15000;
process.once("SIGTERM", () => server.close(() => { void db.close().finally(() => process.exit(0)); }));
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Sunbird social server (PGlite) on http://0.0.0.0:${PORT} · data: ${DATA_DIR}`);
});
