/**
 * App context — the single object every service receives. Keeps the
 * dependency graph explicit and makes services trivially testable (inject a
 * fake clock / data dir).
 */
import type { Config } from "../config.js";
import { AuditLog } from "../anticheat/audit.js";
import { Trust } from "../anticheat/trust.js";
import { RateLimiter } from "../util/ratelimit.js";
import { Db } from "../store/db.js";
import { ObjectStore } from "../store/object-store.js";
import type { IdentityService } from "../identity/IdentityService.js";
import type { FriendsService } from "../friends/FriendsService.js";
import type { RoomService } from "../rooms/RoomService.js";
import type { LeaderboardService } from "../leaderboards/LeaderboardService.js";
import type { GhostService } from "../ghosts/GhostService.js";
import type { TournamentService } from "../tournaments/TournamentService.js";
import type { SquadService } from "../squads/SquadService.js";
import type { AchievementService } from "../achievements/AchievementService.js";
import type { SaveService } from "../saves/SaveService.js";
import type { ModerationService } from "../moderation/ModerationService.js";

export type Ctx = {
  cfg: Config;
  db: Db;
  audit: AuditLog;
  trust: Trust;
  objects: ObjectStore;
  /** Injectable clock — tests advance it to exercise expiries. */
  now: () => number;
  /** REST rate limiters (per IP). */
  rlRead: RateLimiter;
  rlWrite: RateLimiter;
  rlGuest: RateLimiter;
  identity: IdentityService;
  friends: FriendsService;
  rooms: RoomService;
  leaderboards: LeaderboardService;
  ghosts: GhostService;
  tournaments: TournamentService;
  squads: SquadService;
  achievements: AchievementService;
  saves: SaveService;
  moderation: ModerationService;
};
