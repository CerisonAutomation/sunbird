/**
 * Tiny dependency-free HTTP router. Routes are matched in declaration
 * order (so `/mp/v1/...` must be declared before bare `/mp/...` catches),
 * capture groups are named, and handlers return a JSON-able body or throw
 * `HttpError`.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Ctx } from "../core/ctx.js";
import { HttpError, clientAddress, readJson, writeError, writeJson, corsHeaders } from "../util/http.js";

export type Params = Record<string, string>;

export type Route = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  re: RegExp;
  /** read = rlRead, write = rlWrite, guest = rlGuest. */
  rl: "read" | "write" | "guest";
  /**
   * auth: "required" — Bearer session token; "optional" — Bearer if present;
   * "mod" — x-moderator-key header; "guest" — legacy deviceId from body/query.
   */
  auth: "required" | "optional" | "mod" | "guest";
  bodyMaxBytes?: number;
  /** `actor` is the resolved playerId ("required"/"guest" ⇒ always set, "mod" ⇒ "moderator"). */
  handler: (ctx: Ctx, p: Params, q: URLSearchParams, body: Record<string, unknown>, actor: string) => unknown | Promise<unknown>;
};

export type ApiHandler = (req: IncomingMessage, res: ServerResponse) => void;

/** Bearer token → playerId (null when absent/invalid). */
export function authPlayer(ctx: Ctx, req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (token.length < 16) return null;
  return ctx.trust.verifySession(token, (t) => ctx.identity.isRevoked(t));
}

/** Legacy identity: deviceId → playerId (guest links are created on demand). */
export function devicePlayer(ctx: Ctx, deviceId: unknown): string {
  const id = typeof deviceId === "string" ? deviceId.slice(0, 64) : "";
  if (!id) throw new HttpError(400, "deviceId required", "invalidDevice");
  const existing = ctx.db.state.guestLinks[id];
  if (existing && ctx.db.state.profiles[existing]) return existing;
  return ctx.identity.createGuest({ deviceId: id }).playerId;
}

/** Resolve the actor for a route's auth mode ("" for unauthenticated reads). */
export function actorFor(ctx: Ctx, route: Route, req: IncomingMessage, q: URLSearchParams, body: Record<string, unknown>): string {
  if (route.auth === "required") {
    const id = authPlayer(ctx, req);
    if (!id) throw new HttpError(401, "authentication required", "unauthorized");
    return id;
  }
  if (route.auth === "mod") {
    ctx.moderation.assertModerator(req.headers["x-moderator-key"]);
    return "moderator";
  }
  if (route.auth === "guest") {
    return devicePlayer(ctx, body.deviceId ?? q.get("device"));
  }
  return authPlayer(ctx, req) ?? "";
}

export function buildHandler(ctx: Ctx, routes: Route[]): ApiHandler {
  return (req, res) => {
    void handle(ctx, routes, req, res);
  };

  async function handle(ctx: Ctx, routes: Route[], req: IncomingMessage, res: ServerResponse): Promise<void> {
    let url: URL;
    try {
      url = new URL(req.url ?? "/", "http://internal");
    } catch {
      return writeError(res, new HttpError(400, "bad request url", "badUrl"));
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }
    const ip = clientAddress(req);
    for (const route of routes) {
      if (route.method !== req.method) continue;
      const m = url.pathname.match(route.re);
      if (!m) continue;
      const params: Params = {};
      for (const [k, v] of Object.entries(m.groups ?? {})) if (typeof v === "string") params[k] = v;

      // Rate limit BEFORE auth/body so flood attempts are cheap to absorb.
      const limiter = route.rl === "write" ? ctx.rlWrite : route.rl === "guest" ? ctx.rlGuest : ctx.rlRead;
      const wait = limiter.check(route.auth === "required" ? `w:${ip}` : route.rl === "write" ? `w:${ip}` : `r:${ip}`);
      if (wait > 0) {
        return writeError(res, new HttpError(429, "rate limited", "rateLimited", wait));
      }

      // Version pinning: write routes reject unknown client builds when
      // SUNBIRD_CLIENT_BUILD is set (reads stay open for stale clients).
      const isWrite = req.method === "POST" || req.method === "PUT" || req.method === "PATCH";
      if (isWrite) {
        const build = req.headers["x-client-build"];
        if (!ctx.trust.clientBuildAllowed(typeof build === "string" ? build : null, true)) {
          return writeError(res, new HttpError(426, "client build not allowed", "buildNotPinned"));
        }
      }

      let body: Record<string, unknown> = {};
      if (isWrite) {
        try {
          body = await readJson<Record<string, unknown>>(req, route.bodyMaxBytes ?? 16_384);
        } catch (err) {
          return writeError(res, err);
        }
      }

      try {
        const actor = actorFor(ctx, route, req, url.searchParams, body);
        const out = await route.handler(ctx, params, url.searchParams, body, actor);
        return writeJson(res, 200, out === undefined ? { ok: true } : out);
      } catch (err) {
        if (err instanceof HttpError && err.status === 409 && err.code === "conflict") {
          // Save-conflict 409s carry the server copy for client reconciliation.
          try {
            const id = authPlayer(ctx, req);
            if (id) {
              const save = ctx.db.state.saves[id];
              if (save) {
                writeJson(res, 409, {
                  error: err.message,
                  code: "conflict",
                  serverVersion: save.version,
                  serverSave: save,
                });
                return;
              }
            }
          } catch {
            /* fall through to the plain error body */
          }
        }
        return writeError(res, err);
      }
    }
    return writeError(res, new HttpError(404, `no route for ${req.method} ${url.pathname}`, "notFound"));
  }
}
