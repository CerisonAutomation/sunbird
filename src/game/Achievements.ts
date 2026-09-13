import { BIOMES } from "./Biomes";
import { SKINS } from "./Economy";
import type { SaveData } from "./SaveData";

export type Rarity = "bronze" | "silver" | "gold" | "platinum";

export type AchievementDef = {
  id: string;
  title: string;
  desc: string;
  rarity: Rarity;
  target: number;
  metric: (s: SaveData) => number;
};

export const ACHIEVEMENTS: AchievementDef[] = [
  // ── BRONZE — Early game ──
  { id: "flights_10", title: "Wingling", desc: "Complete 10 flights", rarity: "bronze", target: 10, metric: (s) => s.state.runsPlayed },
  { id: "dist_1k", title: "First Horizon", desc: "Fly 1,000 m lifetime", rarity: "bronze", target: 1000, metric: (s) => s.state.lifetime.distance },
  { id: "coins_200", title: "Piggy Bank", desc: "Earn 200 coins lifetime", rarity: "bronze", target: 200, metric: (s) => s.state.lifetime.coins },
  { id: "first_perfect", title: "Butter Landing 🧈", desc: "Land your first perfect landing", rarity: "bronze", target: 1, metric: (s) => s.state.lifetime.ghostBeats > 0 ? 1 : 0 },
  { id: "splash_5", title: "Rubber Duck 🦆", desc: "Splash into water 5 times", rarity: "bronze", target: 5, metric: (s) => s.state.lifetime.zeniths },

  // ── SILVER — Mid game ──
  { id: "flights_25", title: "Frequent Flyer", desc: "Complete 25 flights", rarity: "silver", target: 25, metric: (s) => s.state.runsPlayed },
  { id: "dist_25k", title: "Horizon Chaser", desc: "Fly 25,000 m lifetime", rarity: "silver", target: 25000, metric: (s) => s.state.lifetime.distance },
  { id: "coins_1500", title: "Treasure Nest", desc: "Earn 1,500 coins lifetime", rarity: "silver", target: 1500, metric: (s) => s.state.lifetime.coins },
  { id: "zenith_20", title: "High Flyer", desc: "Hit 20 zenith moments lifetime", rarity: "silver", target: 20, metric: (s) => s.state.lifetime.zeniths },
  { id: "biomes_all", title: "Cartographer", desc: "Visit every island biome", rarity: "silver", target: BIOMES.length, metric: (s) => s.state.biomesSeen.length },
  { id: "speed_demon", title: "Speed Demon 💨", desc: "Reach max speed", rarity: "silver", target: 1, metric: (s) => s.state.bestCombo > 0 ? 1 : 0 },
  { id: "night_owl", title: "Night Owl 🦉", desc: "Fly through the Midnight Coast", rarity: "silver", target: 1, metric: (s) => s.state.biomesSeen.includes("night") ? 1 : 0 },
  { id: "combo_5", title: "Chain Reactor ⛓️", desc: "Get a 5x perfect chain", rarity: "silver", target: 5, metric: (s) => s.state.bestCombo },

  // ── GOLD — Late game ──
  { id: "flights_100", title: "Sky Veteran", desc: "Complete 100 flights", rarity: "gold", target: 100, metric: (s) => s.state.runsPlayed },
  { id: "dist_100k", title: "World Wanderer", desc: "Fly 100,000 m lifetime", rarity: "gold", target: 100000, metric: (s) => s.state.lifetime.distance },
  { id: "coins_5000", title: "Golden Nest", desc: "Earn 5,000 coins lifetime", rarity: "gold", target: 5000, metric: (s) => s.state.lifetime.coins },
  { id: "skins_all", title: "Fashionista 👗", desc: "Own every bird skin", rarity: "gold", target: SKINS.length, metric: (s) => s.state.ownedSkins.length },
  { id: "island_10", title: "Beyond the Map", desc: "Reach island 10 in one flight", rarity: "gold", target: 10, metric: (s) => s.state.farthestIsland + 1 },
  { id: "fever_10", title: "Fever Dream 🤪", desc: "Activate fever mode 10 times", rarity: "gold", target: 10, metric: (s) => s.state.lifetime.zeniths },
  { id: "altitude_king", title: "Altitude King 👑", desc: "Reach 200m altitude", rarity: "gold", target: 200, metric: (s) => s.state.bestAltitude },
  { id: "streak_7", title: "Unstoppable 🔥", desc: "Get a 7-day streak", rarity: "gold", target: 7, metric: (s) => s.state.streak.days },
  { id: "coin_hoarder", title: "Coin Hoarder 🪙", desc: "Have 500 coins at once", rarity: "gold", target: 500, metric: (s) => s.state.wallet },
  { id: "ghost_hunter", title: "Ghost Hunter 👻", desc: "Beat your ghost 5 times", rarity: "gold", target: 5, metric: (s) => s.state.lifetime.ghostBeats },

  // ── PLATINUM — Mastery ──
  { id: "ghost_10", title: "Self Rival", desc: "Beat your own ghost 10 times", rarity: "platinum", target: 10, metric: (s) => s.state.lifetime.ghostBeats },
  { id: "zenith_75", title: "Stratosphere", desc: "Hit 75 zenith moments lifetime", rarity: "platinum", target: 75, metric: (s) => s.state.lifetime.zeniths },
  { id: "prestige", title: "Sunbird Prestige", desc: "Own Gold and VIP", rarity: "platinum", target: 1, metric: (s) => (s.state.gold && s.state.vip ? 1 : 0) },
  { id: "dist_500k", title: "Cosmonaut 🚀", desc: "Fly 500,000 m lifetime", rarity: "platinum", target: 500000, metric: (s) => s.state.lifetime.distance },
  { id: "flights_500", title: "Legendary Wing 🪽", desc: "Complete 500 flights", rarity: "platinum", target: 500, metric: (s) => s.state.runsPlayed },
  { id: "perfect_chain_10", title: "Perfect Storm ⚡", desc: "Get a 10x perfect chain", rarity: "platinum", target: 10, metric: (s) => s.state.bestCombo },
  { id: "coins_50k", title: "Dragon's Vault 🐉", desc: "Earn 50,000 coins lifetime", rarity: "platinum", target: 50000, metric: (s) => s.state.lifetime.coins },
  { id: "island_25", title: "Edge of the World 🌍", desc: "Reach island 25 in one flight", rarity: "platinum", target: 25, metric: (s) => s.state.farthestIsland + 1 },
];

export type AchievementView = {
  def: AchievementDef;
  progress: number;
  unlocked: boolean;
};

export class Achievements {
  constructor(private save: SaveData) {}

  view(): AchievementView[] {
    const unlocked = new Set(this.save.state.achievements);
    return ACHIEVEMENTS.map((def) => {
      const current = Math.min(def.target, def.metric(this.save));
      return { def, progress: current, unlocked: unlocked.has(def.id) || current >= def.target };
    });
  }

  checkNew(): AchievementDef[] {
    const out: AchievementDef[] = [];
    for (const def of ACHIEVEMENTS) {
      if (def.metric(this.save) >= def.target && this.save.unlockAchievement(def.id)) out.push(def);
    }
    return out;
  }

  counts(): { unlocked: number; total: number } {
    const unlocked = new Set(this.save.state.achievements);
    let n = 0;
    for (const def of ACHIEVEMENTS) if (unlocked.has(def.id) || def.metric(this.save) >= def.target) n++;
    return { unlocked: n, total: ACHIEVEMENTS.length };
  }
}
