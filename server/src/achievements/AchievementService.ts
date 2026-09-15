/**
 * AchievementService — server-verified achievement triggers.
 *
 * The client reports its lifetime/seasonal counters with each verified run
 * report. The server:
 *   • rejects DECREASING lifetime counters (tamper detection — the counters
 *     are monotonic, so a forged report that rewinds progress is flagged),
 *   • unlocks achievements exactly once (idempotent),
 *   • keeps seasonal achievements (streaks, races) per seasonId while
 *     lifetime achievements (distance, coins, flights) persist,
 *   • records unlock times for profile/social display.
 */
import type { Ctx } from "../core/ctx.js";
import { HttpError } from "../util/http.js";
import { seasonId as seasonIdOf } from "../util/id.js";
import type { AchievementCounters, AchievementDef, AchievementProgress, Rarity } from "../types.js";

/**
 * Server-side catalog — a subset of the client's ACHIEVEMENTS with the same
 * ids, so a server unlock is exactly the client unlock. `scope` decides
 * whether the counter resets each season.
 */
export const SERVER_ACHIEVEMENTS: AchievementDef[] = [
  { id: "flights_10", title: "Wingling", desc: "Complete 10 flights", rarity: "bronze", target: 10, scope: "lifetime", counter: "runsPlayed" },
  { id: "flights_25", title: "Frequent Flyer", desc: "Complete 25 flights", rarity: "silver", target: 25, scope: "lifetime", counter: "runsPlayed" },
  { id: "flights_100", title: "Sky Veteran", desc: "Complete 100 flights", rarity: "gold", target: 100, scope: "lifetime", counter: "runsPlayed" },
  { id: "flights_200", title: "Sky Master", desc: "Complete 200 flights", rarity: "platinum", target: 200, scope: "lifetime", counter: "runsPlayed" },
  { id: "dist_1k", title: "First Horizon", desc: "Fly 1,000 m lifetime", rarity: "bronze", target: 1000, scope: "lifetime", counter: "lifetimeDistance" },
  { id: "dist_25k", title: "Horizon Chaser", desc: "Fly 25,000 m lifetime", rarity: "silver", target: 25000, scope: "lifetime", counter: "lifetimeDistance" },
  { id: "dist_100k", title: "World Wanderer", desc: "Fly 100,000 m lifetime", rarity: "gold", target: 100000, scope: "lifetime", counter: "lifetimeDistance" },
  { id: "coins_200", title: "Piggy Bank", desc: "Earn 200 coins lifetime", rarity: "bronze", target: 200, scope: "lifetime", counter: "lifetimeCoins" },
  { id: "coins_1500", title: "Treasure Nest", desc: "Earn 1,500 coins lifetime", rarity: "silver", target: 1500, scope: "lifetime", counter: "lifetimeCoins" },
  { id: "coins_5000", title: "Golden Nest", desc: "Earn 5,000 coins lifetime", rarity: "gold", target: 5000, scope: "lifetime", counter: "lifetimeCoins" },
  { id: "races_25", title: "Pack Animal", desc: "Fly 25 mass races", rarity: "silver", target: 25, scope: "seasonal", counter: "racesRun" },
  { id: "races_50", title: "Racing Legend", desc: "Complete 50 races", rarity: "gold", target: 50, scope: "seasonal", counter: "racesRun" },
  { id: "duel_1", title: "First Blood", desc: "Win a ranked duel", rarity: "bronze", target: 1, scope: "lifetime", counter: "duelWins" },
  { id: "duel_10", title: "Duelist", desc: "Win 10 ranked duels", rarity: "silver", target: 10, scope: "lifetime", counter: "duelWins" },
  { id: "duel_50", title: "Blademaster of the Sky", desc: "Win 50 ranked duels", rarity: "gold", target: 50, scope: "lifetime", counter: "duelWins" },
  { id: "streak_3", title: "Hat Trick", desc: "3-day login streak", rarity: "bronze", target: 3, scope: "seasonal", counter: "streakDays" },
  { id: "streak_7", title: "Weekly Warrior", desc: "7-day login streak", rarity: "silver", target: 7, scope: "seasonal", counter: "streakDays" },
  { id: "streak_30", title: "Dedicated", desc: "30-day login streak", rarity: "platinum", target: 30, scope: "seasonal", counter: "streakDays" },
  { id: "altitude_200", title: "Cloud Nine", desc: "Reach 200m altitude", rarity: "silver", target: 200, scope: "lifetime", counter: "bestAltitude" },
  { id: "altitude_500", title: "Stratosphere Runner", desc: "Reach 500m altitude", rarity: "gold", target: 500, scope: "lifetime", counter: "bestAltitude" },
  { id: "altitude_1k", title: "Edge of Space", desc: "Reach 1000m altitude", rarity: "platinum", target: 1000, scope: "lifetime", counter: "bestAltitude" },
  { id: "ghost_10", title: "Self Rival", desc: "Beat your own ghost 10 times", rarity: "platinum", target: 10, scope: "lifetime", counter: "ghostBeats" },
  { id: "ghost_25", title: "Ghost Hunter", desc: "Beat your ghost 25 times", rarity: "platinum", target: 25, scope: "lifetime", counter: "ghostBeats" },
  { id: "zenith_20", title: "High Flyer", desc: "Hit 20 zenith moments lifetime", rarity: "silver", target: 20, scope: "lifetime", counter: "zeniths" },
  { id: "zenith_75", title: "Stratosphere", desc: "Hit 75 zenith moments lifetime", rarity: "platinum", target: 75, scope: "lifetime", counter: "zeniths" },
];

const COUNTER_KEYS = Object.keys(emptyCounters()) as (keyof AchievementCounters)[];

function emptyCounters(): AchievementCounters {
  return {
    runsPlayed: 0,
    lifetimeDistance: 0,
    lifetimeCoins: 0,
    zeniths: 0,
    ghostBeats: 0,
    duelWins: 0,
    racesRun: 0,
    streakDays: 0,
    bestAltitude: 0,
  };
}

export class AchievementService {
  constructor(private ctx: Ctx) {}

  /**
   * Verify a run report's counters and unlock anything newly reached.
   * Returns the newly unlocked achievements (empty = nothing new).
   */
  verify(
    playerId: string,
    input: {
      seasonId?: unknown;
      counters?: unknown;
    },
  ): { newlyUnlocked: { id: string; title: string; rarity: Rarity }[]; counters: AchievementCounters } {
    if (this.ctx.identity.isSuspended(playerId)) throw new HttpError(403, "account suspended", "suspended");
    const profile = this.ctx.identity.requireProfile(playerId);
    const now = this.ctx.now();
    const seasonId =
      typeof input.seasonId === "string" && input.seasonId.length > 0 && input.seasonId.length <= 16
        ? input.seasonId
        : seasonIdOf(now);
    const reported = (input.counters ?? {}) as Record<string, unknown>;
    const merged: AchievementCounters = { ...emptyCounters() };

    for (const key of COUNTER_KEYS) {
      const prev = profile.counters[key];
      const nextRaw = Number(reported[key]);
      const next = Number.isFinite(nextRaw) ? Math.max(0, Math.round(nextRaw)) : prev;
      // Lifetime counters are monotonic — a decreasing value is a tampered
      // report. Keep the stored value and flag the player for review.
      if (next < prev) {
        this.ctx.audit.log(playerId, "achievement.counter_regression", key, { prev, reported: nextRaw });
        this.openFlaggedCase(playerId, `${key} counter regressed (${prev} → ${nextRaw})`);
        merged[key] = prev;
      } else {
        merged[key] = next;
      }
    }
    profile.counters = merged;
    profile.seasonalAchievements = profile.seasonalAchievements ?? {};
    const seasonalCounters = merged; // races/streaks are seasonal-scope counters

    const newlyUnlocked: { id: string; title: string; rarity: Rarity }[] = [];
    for (const def of SERVER_ACHIEVEMENTS) {
      const value = def.scope === "seasonal" ? seasonalCounters[def.counter] : merged[def.counter];
      if (value < def.target) continue;
      const already =
        profile.achievements[def.id] || (def.scope === "seasonal" && (profile.seasonalAchievements[seasonId] ?? []).includes(def.id));
      if (already) continue;
      const at = new Date(now).toISOString();
      profile.achievements[def.id] = at;
      if (def.scope === "seasonal") {
        const list = profile.seasonalAchievements[seasonId] ?? [];
        if (!list.includes(def.id)) list.push(def.id);
        profile.seasonalAchievements[seasonId] = list;
      }
      newlyUnlocked.push({ id: def.id, title: def.title, rarity: def.rarity });
    }
    if (newlyUnlocked.length > 0) {
      this.ctx.db.touch();
      this.ctx.audit.log(playerId, "achievement.unlocked", newlyUnlocked.map((a) => a.id).join(","));
    }
    return { newlyUnlocked, counters: merged };
  }

  /** Progress for all tracked achievements (profile/social surface). */
  progress(playerId: string, seasonId?: string): AchievementProgress[] {
    const profile = this.ctx.identity.requireProfile(playerId);
    const sid = seasonId ?? seasonIdOf(this.ctx.now());
    const seasonal = profile.seasonalAchievements[sid] ?? [];
    return SERVER_ACHIEVEMENTS.map((def) => {
      const isSeasonal = def.scope === "seasonal";
      const current = Math.min(def.target, profile.counters[def.counter]);
      const unlockedAt = profile.achievements[def.id];
      const unlocked = Boolean(unlockedAt) || (isSeasonal && seasonal.includes(def.id));
      return {
        id: def.id,
        title: def.title,
        rarity: def.rarity,
        scope: def.scope,
        target: def.target,
        current,
        unlocked,
        unlockedAt: unlockedAt,
      };
    });
  }

  /** Compact summary for public profiles (counts + latest three). */
  publicSummary(playerId: string): { unlocked: number; total: number; recent: { id: string; at: string }[] } {
    const profile = this.ctx.db.state.profiles[playerId];
    if (!profile) return { unlocked: 0, total: SERVER_ACHIEVEMENTS.length, recent: [] };
    const ids = Object.keys(profile.achievements);
    const recent = Object.entries(profile.achievements)
      .sort((a, b) => b[1].localeCompare(a[1]))
      .slice(0, 3)
      .map(([id, at]) => ({ id, at }));
    return { unlocked: ids.length, total: SERVER_ACHIEVEMENTS.length, recent };
  }

  private openFlaggedCase(playerId: string, reason: string): void {
    const s = this.ctx.db.state;
    const open = s.moderationCases.some((c) => c.kind === "flaggedPlayer" && c.targetId === playerId && c.status === "open");
    if (open) return;
    s.moderationCases.push({
      id: `mc_${s.moderationCases.length.toString(36)}_${Math.floor(this.ctx.now()).toString(36)}`,
      kind: "flaggedPlayer",
      targetId: playerId,
      byId: null,
      reason,
      createdAt: new Date(this.ctx.now()).toISOString(),
      status: "open",
    });
    this.ctx.db.touch();
  }
}
