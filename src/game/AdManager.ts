/**
 * Optimal Ad Monetization Manager for Poki & CrazyGames.
 *
 * Strategy based on official documentation:
 * - Rewarded ads: 60-70% of revenue (highest eCPM, opt-in)
 * - Midgame ads: 30-40% of revenue (baseline, automatic)
 * - Banners: steady passive income on menu screens
 *
 * Key principles:
 * 1. Rewarded ads = meaningful rewards (continue, coins, skins)
 * 2. Midgame ads = natural breaks (game over, between runs)
 * 3. Banners = menu screens only (never during gameplay)
 * 4. Never interrupt active gameplay
 * 5. Let SDK handle pacing (auto-throttles)
 */

import type { PlatformAdapter } from "../sdk/platform";

export type AdPlacement =
  | "continue"        // Rewarded: second wind
  | "double_coins"    // Rewarded: double run coins
  | "free_boost"      // Rewarded: free boost item
  | "unlock_skin"     // Rewarded: watch to unlock cosmetic
  | "game_over"       // Midgame: after death
  | "between_runs"    // Midgame: between runs
  | "menu_banner"     // Banner: main menu
  | "shop_banner";    // Banner: shop screen

export type AdReward = {
  type: "coins" | "continue" | "boost" | "skin" | "xp";
  amount: number;
  skinId?: string;
};

export class AdManager {
  private platform: PlatformAdapter | null = null;
  private adsEnabled = true;
  private lastAdTime = 0;
  private adsThisSession = 0;
  private readonly MIN_AD_GAP_MS = 60000; // 60 seconds between ads (Poki/CrazyGames policy)
  private readonly MAX_ADS_PER_SESSION = 8; // Safety cap per session

  // Ad placement config — what rewards each placement gives
  private readonly PLACEMENTS: Record<AdPlacement, { rewarded: boolean; reward: AdReward }> = {
    continue: {
      rewarded: true,
      reward: { type: "continue", amount: 1 },
    },
    double_coins: {
      rewarded: true,
      reward: { type: "coins", amount: 2 }, // Multiplier
    },
    free_boost: {
      rewarded: true,
      reward: { type: "boost", amount: 1 },
    },
    unlock_skin: {
      rewarded: true,
      reward: { type: "skin", amount: 1, skinId: "ad_skin" },
    },
    game_over: {
      rewarded: false,
      reward: { type: "coins", amount: 0 },
    },
    between_runs: {
      rewarded: false,
      reward: { type: "coins", amount: 0 },
    },
    menu_banner: {
      rewarded: false,
      reward: { type: "coins", amount: 0 },
    },
    shop_banner: {
      rewarded: false,
      reward: { type: "coins", amount: 0 },
    },
  };

  setPlatform(platform: PlatformAdapter | null): void {
    this.platform = platform;
  }

  /** Check if an ad can be shown */
  canShowAd(placement: AdPlacement): boolean {
    if (!this.adsEnabled || !this.platform) return false;
    if (this.platform.name === "none") return false; // Dev mode
    if (this.adsThisSession >= this.MAX_ADS_PER_SESSION) return false;

    const now = Date.now();
    if (now - this.lastAdTime < this.MIN_AD_GAP_MS) return false;

    // Banners only on menu screens
    if (placement === "menu_banner" || placement === "shop_banner") {
      return true; // Always allow banners
    }

    return true;
  }

  /** Show a rewarded ad and return the reward if completed */
  async showRewardedAd(placement: AdPlacement): Promise<AdReward | null> {
    if (!this.canShowAd(placement)) return null;

    const config = this.PLACEMENTS[placement];
    if (!config.rewarded) return null;

    try {
      const success = await this.platform!.rewardedBreak();
      this.lastAdTime = Date.now();
      this.adsThisSession++;

      if (success) {
        return config.reward;
      }
    } catch (e) {
      console.warn("[ads] Rewarded ad failed:", e);
    }
    return null;
  }

  /** Show a midgame (interstitial) ad */
  async showMidgameAd(placement: AdPlacement): Promise<void> {
    if (!this.canShowAd(placement)) return;

    const config = this.PLACEMENTS[placement];
    if (config.rewarded) return; // Not a midgame placement

    try {
      await this.platform!.commercialBreak();
      this.lastAdTime = Date.now();
      this.adsThisSession++;
    } catch (e) {
      console.warn("[ads] Midgame ad failed:", e);
    }
  }

  /** Mount a banner ad in a container element */
  mountBanner(container: HTMLElement): void {
    if (!this.platform || this.platform.name === "none") return;
    this.platform.mountBanner(container);
  }

  /** Get optimal ad triggers for the current game state */
  getOptimalTriggers(state: {
    screen: string;
    runNumber: number;
    coins: number;
    hasGold: boolean;
    isGameOver: boolean;
    canContinue: boolean;
  }): AdPlacement[] {
    const placements: AdPlacement[] = [];

    // Game over → midgame ad (after a brief delay for emotional processing)
    if (state.isGameOver && !state.canContinue) {
      placements.push("game_over");
    }

    // Between runs → midgame ad (natural break)
    if (state.screen === "menu" && state.runNumber > 0) {
      placements.push("between_runs");
    }

    // Continue screen → rewarded ad option
    if (state.canContinue && !state.hasGold) {
      placements.push("continue");
    }

    // Game over → double coins reward option
    if (state.isGameOver && state.coins > 0) {
      placements.push("double_coins");
    }

    // Menu → banner
    if (state.screen === "menu") {
      placements.push("menu_banner");
    }

    // Shop → banner
    if (state.screen === "shop") {
      placements.push("shop_banner");
    }

    return placements;
  }

  /** Disable ads (e.g., for Gold owners on standalone) */
  setEnabled(enabled: boolean): void {
    this.adsEnabled = enabled;
  }

  /** Reset session counters (call on new game session) */
  resetSession(): void {
    this.adsThisSession = 0;
  }

  /** Get ad stats for telemetry */
  getStats(): { thisSession: number; enabled: boolean } {
    return {
      thisSession: this.adsThisSession,
      enabled: this.adsEnabled,
    };
  }
}
