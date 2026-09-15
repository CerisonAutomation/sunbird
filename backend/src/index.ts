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

export { LeaderboardDO } from "./leaderboard";
import { entitlementFromEvent, verifyStripeSignature } from "./entitlements";

export interface Env {
  BOARD: DurableObjectNamespace;
  STRIPE_WEBHOOK_SECRET?: string;
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

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

    if (url.pathname === "/stripe/webhook" && request.method === "POST") {
      // Server-authoritative purchase fulfilment (REPO_TRUTH_AUDIT #12).
      const secret = env.STRIPE_WEBHOOK_SECRET ?? "";
      if (!secret) return json({ error: "webhook not configured" }, 503);
      const raw = await request.text();
      if (raw.length > 65_536) return json({ error: "payload too large" }, 413);
      const ok = await verifyStripeSignature(secret, request.headers.get("stripe-signature"), raw);
      if (!ok) return json({ error: "bad signature" }, 400);
      let evt: unknown;
      try {
        evt = JSON.parse(raw);
      } catch {
        return json({ error: "invalid json" }, 400);
      }
      const grant = entitlementFromEvent(evt as Parameters<typeof entitlementFromEvent>[0]);
      // Unhandled event types are acknowledged so Stripe stops retrying.
      if (!grant) return json({ ok: true, handled: false });
      await board.fetch("https://do/entitlements/grant", {
        method: "POST",
        body: JSON.stringify(grant),
        headers: { "content-type": "application/json" },
      });
      return json({ ok: true, handled: true });
    }

    if (url.pathname === "/entitlements" && request.method === "GET") {
      return board.fetch(`https://do/entitlements${url.search}`).then(withCors);
    }

    if (url.pathname === "/ghost") {
      if (request.method === "POST") {
        const body = await request.text();
        if (body.length > 262_144) return json({ error: "payload too large" }, 413);
        return board
          .fetch("https://do/ghost", { method: "POST", body, headers: { "content-type": "application/json" } })
          .then(withCors);
      }
      return board.fetch(`https://do/ghost${url.search}`).then(withCors);
    }

    if (url.pathname === "/telemetry") {
      if (request.method === "POST") {
        const body = await request.text();
        if (body.length > 8192) return json({ error: "payload too large" }, 413);
        return board
          .fetch("https://do/telemetry", { method: "POST", body, headers: { "content-type": "application/json" } })
          .then(withCors);
      }
      return board.fetch("https://do/telemetry").then(withCors);
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
