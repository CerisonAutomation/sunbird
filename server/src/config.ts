/**
 * Runtime configuration for the Sunbird social backend.
 *
 * Everything is optional: with no env vars the server runs fully in-memory
 * on 127.0.0.1:8790 with dev-grade secrets. Set SUNBIRD_PERSIST=1 to enable
 * JSON file persistence under SUNBIRD_DATA_DIR (default server/data).
 */

export type Config = {
  port: number;
  host: string;
  /** Secret for HMAC session/match tokens. MUST be set in production. */
  tokenSecret: string;
  /** Shared key for moderation routes (X-Moderator-Key). */
  moderationKey: string;
  /** Public base URL used to build share links (join codes, ghost challenges). */
  publicBaseUrl: string;
  /** Client build/protocol pin used for version-pinning checks. */
  clientBuildId: string;
  /** Enable JSON-file persistence under dataDir. */
  persist: boolean;
  dataDir: string;
  /** Leaderboard salt — when set, submissions require an HMAC signature. */
  leaderboardSalt: string;
  /** Server name reported in v1 `hello` frames. */
  serverName: string;
  /** Race session tuning. */
  tickHz: number;
  roomCapacity: number;
  startCountdownMs: number;
  reconnectGraceMs: number;
  dnfGraceMs: number;
  maxRaceMs: number;
  /** Replay object store tuning. */
  ghostMaxSamples: number;
  ghostMaxCompressedBytes: number;
  ghostTtlDays: number;
  ghostMaxPerPlayer: number;
  ghostStoreMaxBytes: number;
  /** Save sync tuning. */
  saveMaxBytes: number;
  /** Rate limits (token buckets). */
  rlReadPerSec: number;
  rlWritePerSec: number;
  rlGuestPerSec: number;
  /** Suspended players stay suspended for this many days by default. */
  suspendDefaultDays: number;
};

function env(key: string, fallback: string): string {
  const v = process.env[key];
  return v !== undefined && v !== "" ? v : fallback;
}

function envInt(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

export function loadConfig(): Config {
  const prod = process.env.NODE_ENV === "production";
  const tokenSecret = env("SUNBIRD_TOKEN_SECRET", "sunbird-dev-token-secret-do-not-ship");
  if (prod && tokenSecret === "sunbird-dev-token-secret-do-not-ship") {
    throw new Error("SUNBIRD_TOKEN_SECRET must be set in production (min 32 chars).");
  }
  return {
    port: envInt("PORT", 8790),
    host: env("HOST", "0.0.0.0"),
    tokenSecret,
    moderationKey: env("SUNBIRD_MODERATION_KEY", "sunbird-dev-moderation"),
    publicBaseUrl: (env("SUNBIRD_PUBLIC_BASE_URL", "") || "http://localhost:5173").replace(/\/$/, ""),
    clientBuildId: env("SUNBIRD_CLIENT_BUILD", "unpinned"),
    persist: env("SUNBIRD_PERSIST", "0") === "1",
    dataDir: env("SUNBIRD_DATA_DIR", new URL("../data/", import.meta.url).pathname),
    leaderboardSalt: env("SUNBIRD_LEADERBOARD_SALT", ""),
    serverName: env("SUNBIRD_SERVER_NAME", "sunbird-social"),
    tickHz: envInt("SUNBIRD_TICK_HZ", 15),
    roomCapacity: envInt("SUNBIRD_ROOM_CAPACITY", 40),
    startCountdownMs: envInt("SUNBIRD_START_COUNTDOWN_MS", 6000),
    reconnectGraceMs: envInt("SUNBIRD_RECONNECT_GRACE_MS", 60_000),
    dnfGraceMs: envInt("SUNBIRD_DNF_GRACE_MS", 15_000),
    maxRaceMs: envInt("SUNBIRD_MAX_RACE_MS", 20 * 60_000),
    ghostMaxSamples: envInt("SUNBIRD_GHOST_MAX_SAMPLES", 1500),
    ghostMaxCompressedBytes: envInt("SUNBIRD_GHOST_MAX_COMPRESSED_BYTES", 262_144),
    ghostTtlDays: envInt("SUNBIRD_GHOST_TTL_DAYS", 90),
    ghostMaxPerPlayer: envInt("SUNBIRD_GHOST_MAX_PER_PLAYER", 50),
    ghostStoreMaxBytes: envInt("SUNBIRD_GHOST_STORE_MAX_BYTES", 512 * 1024 * 1024),
    saveMaxBytes: envInt("SUNBIRD_SAVE_MAX_BYTES", 65_536),
    rlReadPerSec: envInt("SUNBIRD_RL_READ_PER_SEC", 20),
    rlWritePerSec: envInt("SUNBIRD_RL_WRITE_PER_SEC", 5),
    rlGuestPerSec: envInt("SUNBIRD_RL_GUEST_PER_SEC", 2),
    suspendDefaultDays: envInt("SUNBIRD_SUSPEND_DEFAULT_DAYS", 30),
  };
}
