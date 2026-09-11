/**
 * Sunbird serverless backend — Cloudflare Workers (free plan).
 *
 * Why this stack (researched 2026-09):
 *  • Workers free tier: 100k requests/day, ~0 ms cold starts at 300+ edge
 *    locations — the best always-free compute tier of any major provider.
 *  • Durable Objects are now on the free plan (SQLite-backed): the only free
 *    serverless primitive with *stateful WebSockets* + strong consistency,
 *    which is exactly what a 40-pilot race room needs. Supabase Realtime and
 *    Deno Deploy were evaluated; neither gives a per-room single-threaded
 *    authority with hibernation-priced WebSockets.
 *  • WebSocket Hibernation: idle rooms cost zero duration, so the ~13k GB-s/day
 *    free duration budget is spent only while races are actually running.
 *
 * Endpoints (mirrors LEADERBOARD_API.md + server/sunbird-server.mjs):
 *   GET  /health              → { ok, rooms?, scores }
 *   GET  /board?scope&metric&device
 *   POST /score
 *   GET  /ws?device&name&skin&hue&room&seed   (WebSocket upgrade)
 *   GET  /                    (WebSocket upgrade, same as /ws — the client
 *                              connects to VITE_MULTIPLAYER_URL verbatim)
 */

export { RoomDO } from "./room";
export { LeaderboardDO } from "./leaderboard";

export interface Env {
  ROOMS: DurableObjectNamespace;
  BOARD: DurableObjectNamespace;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newCode(): string {
  let out = "";
  for (let i = 0; i < 5; i++) out += CODE_ALPHABET[(Math.random() * CODE_ALPHABET.length) | 0];
  return out;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

/**
 * Public matchmaking directory.
 *
 * One well-known DO per (seed, shard) tracks which public room code is
 * currently filling. Private rooms skip this entirely: the room code *is* the
 * DO name, so friends land in the same object by construction.
 */
async function pickPublicRoom(env: Env, seed: string): Promise<string> {
  const dirId = env.ROOMS.idFromName(`dir:${seed}`);
  const dir = env.ROOMS.get(dirId);
  const res = await dir.fetch("https://do/directory/pick", { method: "POST" });
  if (res.ok) {
    const body = (await res.json()) as { code?: string };
    if (body.code) return body.code;
  }
  return newCode();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    /* -------------------------------------------------- WebSocket rooms */
    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const seed = (url.searchParams.get("seed") ?? todayStr()).slice(0, 64);
      let code = (url.searchParams.get("room") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
      const isPublic = code.length === 0;
      if (isPublic) code = await pickPublicRoom(env, seed);

      const roomId = env.ROOMS.idFromName(`room:${code}`);
      const room = env.ROOMS.get(roomId);
      // Forward the original query string so the room sees device/name/skin/hue.
      const fwd = new URL(`https://do/join${url.search}`);
      fwd.searchParams.set("room", code);
      fwd.searchParams.set("seed", seed);
      fwd.searchParams.set("public", isPublic ? "1" : "0");
      return room.fetch(fwd.toString(), request);
    }

    /* ------------------------------------------------------ HTTP routes */
    const board = env.BOARD.get(env.BOARD.idFromName("global"));

    if (url.pathname === "/health") {
      const res = await board.fetch("https://do/stats");
      const stats = (await res.json()) as Record<string, unknown>;
      return json({ ok: true, ...stats });
    }

    if (url.pathname === "/board" && request.method === "GET") {
      return board.fetch(`https://do/board${url.search}`).then(withCors);
    }

    if (url.pathname === "/score" && request.method === "POST") {
      const body = await request.text();
      if (body.length > 4096) return json({ error: "payload too large" }, 413);
      return board
        .fetch("https://do/score", { method: "POST", body, headers: { "content-type": "application/json" } })
        .then(withCors);
    }

    return json({ error: "not found" }, 404);
  },
} satisfies ExportedHandler<Env>;

async function withCors(res: Response): Promise<Response> {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
  return out;
}
