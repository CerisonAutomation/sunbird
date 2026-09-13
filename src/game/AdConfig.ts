/**
 * Optimal Ad Configuration for Poki & CrazyGames.
 *
 * Based on official documentation:
 * - Poki: "call commercialBreak() before every gameplayStart(), whenever the player has shown intent to continue playing"
 * - CrazyGames: "Request midgame ads at every natural break in your game loop. The SDK handles ad pacing automatically (max 1 every 3 minutes)"
 *
 * Strategy:
 * 1. Rewarded ads (60-70% revenue) — meaningful rewards, player-initiated
 * 2. Midgame ads (30-40% revenue) — natural breaks, SDK-paced
 * 3. Banners (passive) — menu screens only, never during gameplay
 */

/** Ad placement types */
export type AdPlacement =
  | "continue"         // Rewarded: second wind (highest value — player just died)
  | "double_coins"     // Rewarded: double run coins (high value — end of run)
  | "free_boost"       // Rewarded: free boost item (medium value — pre-run)
  | "unlock_skin"      // Rewarded: watch to unlock cosmetic (medium value — shop)
  | "game_over"        // Midgame: after death (natural break)
  | "between_runs"     // Midgame: between runs (natural break)
  | "mode_select"      // Midgame: mode selection screen
  | "menu_banner"      // Banner: main menu
  | "shop_banner"      // Banner: shop screen
  | "pass_banner";     // Banner: season pass screen

/** Ad reward types */
export type AdReward = {
  type: "coins" | "continue" | "boost" | "skin" | "xp";
  amount: number;
  skinId?: string;
  boostId?: string;
};

/** Ad configuration per placement */
export type AdConfig = {
  type: "rewarded" | "midgame" | "banner";
  reward: AdReward | null;
  priority: number; // Higher = show first when multiple options
  cooldownMs: number; // Minimum time between this placement
  maxPerSession: number; // Cap per session
  requiresGold: boolean; // If true, Gold owners see this instead of buying
};

/**
 * Optimal ad placements based on platform research.
 *
 * Revenue impact (per 1000 plays):
 * - Rewarded: $4-10 (highest eCPM, opt-in)
 * - Midgame: $2-6 (baseline, automatic)
 * - Banners: $0.50-1 (passive, menu only)
 */
export const AD_CONFIGS: Record<AdPlacement, AdConfig> = {
  // === REWARDED ADS (highest revenue, player-initiated) ===
  continue: {
    type: "rewarded",
    reward: { type: "continue", amount: 1 },
    priority: 10, // Highest — player just died, emotional moment
    cooldownMs: 0, // No cooldown — player chooses to watch
    maxPerSession: 1, // Once per run (game design: unlimited continues trivialize)
    requiresGold: false, // Gold owners get free continues
  },
  double_coins: {
    type: "rewarded",
    reward: { type: "coins", amount: 2 }, // 2x multiplier
    priority: 8, // High — end of run, player sees coin total
    cooldownMs: 0,
    maxPerSession: 3, // Can watch multiple times per session
    requiresGold: false, // Gold owners already get 2x coins
  },
  free_boost: {
    type: "rewarded",
    reward: { type: "boost", amount: 1 },
    priority: 5, // Medium — pre-run, player is planning
    cooldownMs: 30000, // 30s between boost ads
    maxPerSession: 2,
    requiresGold: false,
  },
  unlock_skin: {
    type: "rewarded",
    reward: { type: "skin", amount: 1, skinId: "ad_skin" },
    priority: 3, // Low — cosmetic, less urgent
    cooldownMs: 60000, // 1 minute between skin ads
    maxPerSession: 1,
    requiresGold: false, // Gold owners get Phoenix skin
  },

  // === MIDGAME ADS (baseline revenue, automatic) ===
  game_over: {
    type: "midgame",
    reward: null,
    priority: 7, // High — natural break after death
    cooldownMs: 180000, // 3 minutes (CrazyGames SDK handles this, but we enforce)
    maxPerSession: 4,
    requiresGold: false, // Gold owners skip midgame ads
  },
  between_runs: {
    type: "midgame",
    reward: null,
    priority: 6, // Medium-high — natural break between runs
    cooldownMs: 180000, // 3 minutes
    maxPerSession: 4,
    requiresGold: false,
  },
  mode_select: {
    type: "midgame",
    reward: null,
    priority: 4, // Medium — screen transition
    cooldownMs: 300000, // 5 minutes — less frequent
    maxPerSession: 2,
    requiresGold: false,
  },

  // === BANNER ADS (passive, menu only) ===
  menu_banner: {
    type: "banner",
    reward: null,
    priority: 1, // Low — always show on menu
    cooldownMs: 0, // Always visible
    maxPerSession: 999, // Unlimited
    requiresGold: false,
  },
  shop_banner: {
    type: "banner",
    reward: null,
    priority: 1,
    cooldownMs: 0,
    maxPerSession: 999,
    requiresGold: false,
  },
  pass_banner: {
    type: "banner",
    reward: null,
    priority: 1,
    cooldownMs: 0,
    maxPerSession: 999,
    requiresGold: false,
  },
};

/** Platform-specific overrides */
export const PLATFORM_OVERRIDES: Record<string, Partial<Record<AdPlacement, Partial<AdConfig>>>> = {
  poki: {
    // Poki: "Unlimited rewarded videos are allowed, but set limits that protect your balance"
    continue: { maxPerSession: 1 },
    double_coins: { maxPerSession: 3 },
    // Poki: SDK handles midgame pacing automatically
    game_over: { cooldownMs: 0 }, // Let SDK decide
    between_runs: { cooldownMs: 0 }, // Let SDK decide
  },
  crazy: {
    // CrazyGames: "max 1 midgame every 3 minutes" (SDK enforced)
    game_over: { cooldownMs: 180000 },
    between_runs: { cooldownMs: 180000 },
    // CrazyGames: Rewarded ads have highest eCPM
    continue: { maxPerSession: 1 },
    double_coins: { maxPerSession: 2 },
  },
  none: {
    // Dev mode: no ads
    ...Object.fromEntries(
      Object.keys(AD_CONFIGS).map(k => [k, { maxPerSession: 0 }])
    ),
  },
};

/** Get effective config for a placement on a platform */
export function getAdConfig(placement: AdPlacement, platform: string): AdConfig {
  const base = AD_CONFIGS[placement];
  const overrides = PLATFORM_OVERRIDES[platform]?.[placement] ?? {};
  return { ...base, ...overrides };
}

/** Calculate revenue potential per 1000 plays */
export function estimateRevenue(
  platform: string,
  avgRewardedWatches: number = 2,
  avgMidgameImpressions: number = 3,
): { rewarded: number; midgame: number; banner: number; total: number } {
  const eCPM: Record<string, { rewarded: number; midgame: number; banner: number }> = {
    poki: { rewarded: 6, midgame: 3, banner: 0.5 },
    crazy: { rewarded: 8, midgame: 4, banner: 0.75 },
    gamepix: { rewarded: 5, midgame: 3, banner: 0.5 },
    y8: { rewarded: 3, midgame: 2, banner: 0.25 },
    default: { rewarded: 4, midgame: 2, banner: 0.3 },
  };
  const rates = eCPM[platform] ?? eCPM.default;
  return {
    rewarded: (rates.rewarded * avgRewardedWatches) / 1000,
    midgame: (rates.midgame * avgMidgameImpressions) / 1000,
    banner: rates.banner / 1000,
    total: (rates.rewarded * avgRewardedWatches + rates.midgame * avgMidgameImpressions + rates.banner) / 1000,
  };
}
