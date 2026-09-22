/**
 * Sunbird social backend — server assembly.
 *
 * `buildCtx()` wires config, stores, and every service into one Ctx (the
 * services reference each other lazily, so placeholder-then-assign works).
 * `createApp()` returns the HTTP server with REST routes + WS gateways
 * attached, plus a periodic sweeper for ghosts/squads.
 *
 * Self-contained: in-memory by default; SUNBIRD_PERSIST=1 enables JSON
 * file persistence. No external services required.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import type { Config } from "./config.js";
import { loadConfig } from "./config.js";
import type { Ctx } from "./core/ctx.js";
import { AuditLog } from "./anticheat/audit.js";
import { Trust } from "./anticheat/trust.js";
import { RateLimiter } from "./util/ratelimit.js";
import { Db, dataFilePath } from "./store/db.js";
import { ObjectStore } from "./store/object-store.js";
import { IdentityService } from "./identity/IdentityService.js";
import { FriendsService } from "./friends/FriendsService.js";
import { RoomService } from "./rooms/RoomService.js";
import { LeaderboardService } from "./leaderboards/LeaderboardService.js";
import { GhostService } from "./ghosts/GhostService.js";
import { TournamentService } from "./tournaments/TournamentService.js";
import { SquadService } from "./squads/SquadService.js";
import { AchievementService } from "./achievements/AchievementService.js";
import { SaveService } from "./saves/SaveService.js";
import { ModerationService } from "./moderation/ModerationService.js";
import { buildHandler } from "./http/router.js";
import { V1_ROUTES } from "./http/api.js";
import { LEGACY_ROUTES } from "./http/legacy.js";
import { TelemetryService } from "./telemetry/TelemetryService.js";
import { attachGateways } from "./realtime/gateways.js";

/**
 * Assemble the full dependency graph. Pass config overrides for tests
 * (e.g. a deterministic clock via `now`).
 */
export function buildCtx(overrides: { cfg?: Partial<Config>; now?: () => number } = {}): Ctx {
  const cfg: Config = { ...loadConfig(), ...(overrides.cfg ?? {}) };
  const now = overrides.now ?? Date.now;
  const dataDir = cfg.persist ? cfg.dataDir : null;

  const db = new Db(undefined, dataDir ? dataFilePath(cfg.dataDir) : null);
  const objects = new ObjectStore(
    dataDir,
    cfg.ghostStoreMaxBytes,
    Math.min(64 * 1024 * 1024, cfg.ghostMaxCompressedBytes * cfg.ghostMaxPerPlayer),
    cfg.ghostMaxPerPlayer,
  );
  const audit = new AuditLog(dataDir);
  const trust = new Trust(cfg);

  const ctx: Ctx = {
    cfg,
    db,
    audit,
    trust,
    objects,
    now,
    // Rate limiters: small burst, refilled at the configured rate.
    rlRead: new RateLimiter(Math.max(5, cfg.rlReadPerSec * 2), cfg.rlReadPerSec),
    rlWrite: new RateLimiter(Math.max(5, cfg.rlWritePerSec * 2), cfg.rlWritePerSec),
    rlGuest: new RateLimiter(Math.max(4, cfg.rlGuestPerSec * 2), cfg.rlGuestPerSec),
    // Stateless aggregate sink — no peers, constructed inline.
    telemetry: new TelemetryService(),
    // Service placeholders — assigned below (services resolve peers lazily).
    identity: null as never,
    friends: null as never,
    rooms: null as never,
    leaderboards: null as never,
    ghosts: null as never,
    tournaments: null as never,
    squads: null as never,
    achievements: null as never,
    saves: null as never,
    moderation: null as never,
  };

  ctx.identity = new IdentityService(ctx);
  ctx.friends = new FriendsService(ctx);
  ctx.rooms = new RoomService(ctx);
  ctx.leaderboards = new LeaderboardService(ctx);
  ctx.ghosts = new GhostService(ctx);
  ctx.tournaments = new TournamentService(ctx);
  ctx.squads = new SquadService(ctx);
  ctx.achievements = new AchievementService(ctx);
  ctx.saves = new SaveService(ctx);
  ctx.moderation = new ModerationService(ctx);

  return ctx;
}

export type App = {
  server: ReturnType<typeof createServer>;
  ctx: Ctx;
  /** Starts listening; resolves with the bound port. */
  listen(port?: number): Promise<number>;
  close(): Promise<void>;
};

export function createApp(overrides: { cfg?: Partial<Config>; now?: () => number } = {}): App {
  const ctx = buildCtx(overrides);
  // v1 routes must match before legacy `/mp/...` catches.
  const api = buildHandler(ctx, [...V1_ROUTES, ...LEGACY_ROUTES]);
  const server = createServer((req, res) => {
    api(req, res);
  });
  const closeGateways = attachGateways(ctx, server);

  const housekeeping = setInterval(() => {
    try {
      ctx.ghosts.sweep();
      ctx.squads.sweepProbation();
      ctx.squads.sweepSuccession();
    } catch {
      /* housekeeping must never take the server down */
    }
  }, 60_000);
  housekeeping.unref?.();

  let closed = false;
  return {
    server,
    ctx,
    listen(port = ctx.cfg.port) {
      return new Promise<number>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, ctx.cfg.host, () => {
          const addr = server.address() as AddressInfo;
          resolve(addr.port);
        });
      });
    },
    async close() {
      if (closed) return;
      closed = true;
      clearInterval(housekeeping);
      closeGateways();
      ctx.rooms.close();
      ctx.rlRead.close();
      ctx.rlWrite.close();
      ctx.rlGuest.close();
      ctx.db.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
