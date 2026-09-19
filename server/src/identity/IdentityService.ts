/**
 * IdentityService — guest identity, platform upgrade, profile retrieval,
 * privacy updates, suspension/restoration.
 *
 * Privacy & moderation enforcement: `publicView()` is the ONLY shape that
 * leaves the service for third-party consumers. Leaderboard, friend, and
 * room queries all route through it, so a suspended or private player can
 * never leak through one surface while hidden from another.
 */
import type { Ctx } from "../core/ctx.js";
import { HttpError, cleanText } from "../util/http.js";
import { randomId, playerCodeFor } from "../util/id.js";
import { emptyCounters, friendshipKey } from "../store/db.js";
import type { AchievementCounters, IdentityCredentials, PlayerProfile, PrivacySettings, PublicProfile } from "../types.js";

const NAME_MAX = 14;
const PRESENCE_WINDOW_MS = 5 * 60_000;
const ACHIEVEMENT_RECENT = 3;

export class IdentityService {
  constructor(private ctx: Ctx) {}

  /* ------------------------------------------------------------- creation */

  createGuest(input: { deviceId?: unknown; name?: unknown; countryCode?: unknown }): IdentityCredentials {
    const deviceId = typeof input.deviceId === "string" ? input.deviceId.slice(0, 64) : "";
    const existing = deviceId ? this.ctx.db.state.guestLinks[deviceId] : undefined;
    if (existing && this.ctx.db.state.profiles[existing]) {
      const profile = this.ctx.db.state.profiles[existing]!;
      this.touch(profile);
      return { playerId: profile.playerId, token: this.ctx.trust.signSession(profile.playerId, this.ctx.now()), profile };
    }
    const profile = this.freshProfile(input.name, {
      guest: true,
      countryCode: typeof input.countryCode === "string" ? input.countryCode.slice(0, 2).toUpperCase() : undefined,
    });
    this.store(profile, deviceId);
    this.ctx.audit.log(profile.playerId, "identity.guest_created", profile.playerId, { device: deviceId ? `${deviceId.slice(0, 8)}…` : undefined });
    const token = this.ctx.trust.signSession(profile.playerId, this.ctx.now());
    return { playerId: profile.playerId, token, profile };
  }

  /**
   * Upgrade a guest to a platform identity (CrazyGames/Poki). The platform
   * identity is a pseudonymous device key — CrazyGames' public SDK exposes
   * no account, so we hash it into a stable platformId. Idempotent: the
   * same platform key always lands on the same profile.
   */
  upgrade(
    playerId: string,
    input: { platform: unknown; platformId: unknown; name?: unknown },
  ): PlayerProfile {
    const profile = this.requireProfile(playerId);
    if (profile.moderation.status === "suspended") throw new HttpError(403, "account suspended", "suspended");
    const platform = cleanText(input.platform, 32).toLowerCase();
    const platformId = typeof input.platformId === "string" ? input.platformId.slice(0, 128) : "";
    if (!platform || !platformId) throw new HttpError(400, "platform and platformId are required", "invalidPlatform");

    const linkKey = `${platform}:${platformId}`;
    const linkedId = this.ctx.db.state.platformLinks[linkKey];
    if (linkedId && linkedId !== playerId) {
      // This platform identity already belongs to another profile.
      // Survivor rule: the EXISTING portal account keeps its identity (its
      // player id, code, and social graph must not jump when a device
      // changes); the incoming profile's progress is merged into it.
      // Exception: a non-guest caller (an account switching platforms)
      // survives and absorbs the donor.
      const other = this.ctx.db.state.profiles[linkedId];
      if (other) {
        const survivorId = profile.guest ? linkedId : playerId;
        const donorId = survivorId === playerId ? linkedId : playerId;
        const survivor = this.ctx.db.state.profiles[survivorId]!;
        const donor = this.ctx.db.state.profiles[donorId]!;
        for (const k of Object.keys(donor.counters) as (keyof AchievementCounters)[]) {
          survivor.counters[k] = Math.max(survivor.counters[k], donor.counters[k]);
        }
        for (const [id, at] of Object.entries(donor.achievements)) {
          if (!survivor.achievements[id]) survivor.achievements[id] = at;
        }
        for (const [deviceId, pid] of Object.entries(this.ctx.db.state.guestLinks)) {
          if (pid === donorId) this.ctx.db.state.guestLinks[deviceId] = survivorId;
        }
        if (donor.guest) {
          delete this.ctx.db.state.profiles[donorId];
          delete this.ctx.db.state.codeIndex[donor.playerCode];
        } else {
          donor.platform = undefined; // the platform link now belongs to the survivor
        }
        this.ctx.audit.log(survivorId, "identity.platform_merged", donorId, { platform });
        return this.finalizeUpgrade(survivorId, platform, platformId, input.name);
      }
    }
    return this.finalizeUpgrade(playerId, platform, platformId, input.name);
  }

  private finalizeUpgrade(playerId: string, platform: string, platformId: string, name: unknown): PlayerProfile {
    const profile = this.requireProfile(playerId);
    const s = this.ctx.db.state;
    s.platformLinks[`${platform}:${platformId}`] = playerId;
    profile.guest = false;
    profile.platform = { name: platform, platformId, linkedAt: new Date(this.ctx.now()).toISOString() };
    if (typeof name === "string" && name.trim()) {
      profile.displayName = cleanText(name, NAME_MAX) || profile.displayName;
    }
    this.touch(profile);
    this.ctx.audit.log(playerId, "identity.upgraded", profile.playerCode, { platform });
    return profile;
  }

  /* ------------------------------------------------------------- queries */

  requireProfile(playerId: string): PlayerProfile {
    const p = this.ctx.db.state.profiles[playerId];
    if (!p) throw new HttpError(404, "unknown player", "notFound");
    return p;
  }

  /** Full self-view. */
  me(playerId: string): PlayerProfile {
    const profile = this.requireProfile(playerId);
    this.expireTemporary(profile);
    this.touch(profile);
    return profile;
  }

  /**
   * Exact-player-code lookup — the ONLY third-party search surface. There is
   * deliberately no name search / browse endpoint.
   */
  byCode(code: string, viewerId?: string): PublicProfile | null {
    const clean = code.trim().toUpperCase();
    if (!/^SUN-[A-Z0-9]{6}$/.test(clean)) return null;
    const playerId = this.ctx.db.state.codeIndex[clean];
    if (!playerId) return null;
    return this.publicView(playerId, viewerId);
  }

  /**
   * Privacy-filtered third-party view. Blocked viewers get 404 (existence
   * must not be leakable); suspended players show as "Pilot" with no avatar.
   */
  publicView(playerId: string, viewerId?: string): PublicProfile {
    const profile = this.requireProfile(playerId);
    this.expireTemporary(profile);
    if (viewerId && this.isBlocked(viewerId, profile.playerId)) {
      throw new HttpError(404, "unknown player", "notFound");
    }
    const suspended = profile.moderation.status === "suspended";
    const recent = Object.entries(profile.achievements)
      .sort((a, b) => b[1].localeCompare(a[1]))
      .slice(0, ACHIEVEMENT_RECENT)
      .map(([id, at]) => ({ id, at }));
    return {
      playerId: profile.playerId,
      playerCode: profile.playerCode,
      displayName: suspended ? "Pilot" : profile.displayName,
      avatarUrl: suspended ? undefined : profile.avatarUrl,
      guest: profile.guest,
      countryCode: profile.privacy.showPresence && !suspended ? profile.countryCode : undefined,
      moderation: suspended ? "suspended" : "clear",
      online: !suspended && profile.privacy.showPresence && this.ctx.now() - Date.parse(profile.lastSeenAt) < PRESENCE_WINDOW_MS,
      recentAchievements: suspended ? [] : recent,
    };
  }

  updatePrivacy(playerId: string, patch: Partial<PrivacySettings>): PlayerProfile {
    const profile = this.requireProfile(playerId);
    if (typeof patch.showOnLeaderboards === "boolean") profile.privacy.showOnLeaderboards = patch.showOnLeaderboards;
    if (typeof patch.allowFriendRequests === "boolean") profile.privacy.allowFriendRequests = patch.allowFriendRequests;
    if (typeof patch.allowInvites === "boolean") profile.privacy.allowInvites = patch.allowInvites;
    if (typeof patch.showPresence === "boolean") profile.privacy.showPresence = patch.showPresence;
    if (patch.replays === "public" || patch.replays === "friends" || patch.replays === "private") {
      profile.privacy.replays = patch.replays;
    }
    this.touch(profile);
    this.ctx.audit.log(playerId, "identity.privacy_updated", profile.playerCode, { patch });
    return profile;
  }

  updateName(playerId: string, name: unknown): PlayerProfile {
    const profile = this.requireProfile(playerId);
    const clean = cleanText(name, NAME_MAX);
    if (!clean) throw new HttpError(400, "name must be 1-14 characters", "invalidName");
    profile.displayName = clean;
    this.touch(profile);
    return profile;
  }

  /** Liveness bump (called on any authenticated request). */
  touchPresence(playerId: string): void {
    const profile = this.ctx.db.state.profiles[playerId];
    if (!profile) return;
    const iso = new Date(this.ctx.now()).toISOString();
    if (profile.lastSeenAt !== iso) {
      profile.lastSeenAt = iso;
      this.ctx.db.touch();
    }
  }

  /* ------------------------------------------------------- moderation */

  suspend(playerId: string, reasonCode: string, durationDays?: number): PlayerProfile {
    const profile = this.requireProfile(playerId);
    profile.moderation = {
      status: "suspended",
      reasonCode: cleanText(reasonCode, 40) || "policy",
      expiresAt:
        durationDays && durationDays > 0
          ? new Date(this.ctx.now() + durationDays * 86_400_000).toISOString()
          : undefined,
    };
    // Propagation: drop presence, kill live seats, keep scores quarantined
    // by the moderation gate (leaderboard reads filter suspended players).
    this.touch(profile);
    this.ctx.audit.log("moderator", "identity.suspended", profile.playerCode, { reasonCode, durationDays });
    this.ctx.rooms.kickPlayer(playerId, "suspended");
    return profile;
  }

  restore(playerId: string): PlayerProfile {
    const profile = this.requireProfile(playerId);
    profile.moderation = { status: "clear" };
    this.touch(profile);
    this.ctx.audit.log("moderator", "identity.restored", profile.playerCode);
    return profile;
  }

  mute(playerId: string, hours: number): PlayerProfile {
    const profile = this.requireProfile(playerId);
    profile.moderation = {
      status: "muted",
      reasonCode: profile.moderation.reasonCode,
      expiresAt: new Date(this.ctx.now() + Math.max(1, hours) * 3_600_000).toISOString(),
    };
    this.touch(profile);
    this.ctx.audit.log("moderator", "identity.muted", profile.playerCode, { hours });
    return profile;
  }

  isSuspended(playerId: string): boolean {
    const profile = this.ctx.db.state.profiles[playerId];
    if (!profile) return true;
    this.expireTemporary(profile);
    return profile.moderation.status === "suspended";
  }

  isMuted(playerId: string): boolean {
    const profile = this.ctx.db.state.profiles[playerId];
    if (!profile) return false;
    this.expireTemporary(profile);
    return profile.moderation.status === "muted";
  }

  isBlocked(blockerId: string, targetId: string): boolean {
    const list = this.ctx.db.state.blocks[blockerId];
    return Boolean(list && list.includes(targetId));
  }

  block(blockerId: string, targetId: string): void {
    const list = this.ctx.db.state.blocks[blockerId] ?? [];
    if (!list.includes(targetId)) list.push(targetId);
    this.ctx.db.state.blocks[blockerId] = list;
    // A block is one-directional, but an existing friendship is dissolved for
    // both sides — you cannot keep a friend you blocked.
    const key = friendshipKey(blockerId, targetId);
    if (this.ctx.db.state.friendships[key]) {
      delete this.ctx.db.state.friendships[key];
      this.ctx.audit.log(blockerId, "friends.block_dissolved", targetId);
    }
    this.ctx.db.touch();
    this.ctx.audit.log(blockerId, "identity.blocked", targetId);
  }

  unblock(blockerId: string, targetId: string): void {
    const list = this.ctx.db.state.blocks[blockerId];
    if (!list) return;
    this.ctx.db.state.blocks[blockerId] = list.filter((id) => id !== targetId);
    this.ctx.db.touch();
    this.ctx.audit.log(blockerId, "identity.unblocked", targetId);
  }

  revokeSession(token: string): void {
    const list = this.ctx.db.state.revokedTokens;
    if (!list.includes(token)) {
      list.push(token);
      if (list.length > 10_000) list.splice(0, list.length - 10_000);
      this.ctx.db.touch();
    }
  }

  isRevoked(token: string): boolean {
    return this.ctx.db.state.revokedTokens.includes(token);
  }

  /* -------------------------------------------------------------- helpers */

  private freshProfile(name: unknown, opts: { guest: boolean; countryCode?: string }): PlayerProfile {
    const nowIso = new Date(this.ctx.now()).toISOString();
    const playerId = randomId("p");
    return {
      playerId,
      playerCode: playerCodeFor(playerId),
      displayName: cleanText(name, NAME_MAX) || "Sunbird Pilot",
      guest: opts.guest,
      countryCode: opts.countryCode,
      createdAt: nowIso,
      updatedAt: nowIso,
      lastSeenAt: nowIso,
      privacy: {
        showOnLeaderboards: true,
        allowFriendRequests: true,
        allowInvites: true,
        showPresence: true,
        replays: "public",
      },
      moderation: { status: "clear" },
      counters: emptyCounters(),
      achievements: {},
      seasonalAchievements: {},
    };
  }

  private store(profile: PlayerProfile, deviceId?: string): void {
    this.ctx.db.state.profiles[profile.playerId] = profile;
    this.ctx.db.state.codeIndex[profile.playerCode] = profile.playerId;
    if (deviceId) this.ctx.db.state.guestLinks[deviceId] = profile.playerId;
    this.ctx.db.touch();
  }

  private touch(profile: PlayerProfile): void {
    profile.updatedAt = new Date(this.ctx.now()).toISOString();
    this.ctx.db.touch();
  }

  /** Temporary suspensions/mutes self-heal; called on every read. */
  private expireTemporary(profile: PlayerProfile): void {
    if (profile.moderation.status === "clear") return;
    if (!profile.moderation.expiresAt) return;
    if (this.ctx.now() >= Date.parse(profile.moderation.expiresAt)) {
      profile.moderation = { status: "clear" };
      this.ctx.db.touch();
    }
  }
}
