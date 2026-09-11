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
  { id: "flights_10", title: "Wingling", desc: "Complete 10 flights", rarity: "bronze", target: 10, metric: (s) => s.state.runsPlayed },
  { id: "dist_1k", title: "First Horizon", desc: "Fly 1,000 m lifetime", rarity: "bronze", target: 1000, metric: (s) => s.state.lifetime.distance },
  { id: "coins_200", title: "Piggy Bank", desc: "Earn 200 coins lifetime", rarity: "bronze", target: 200, metric: (s) => s.state.lifetime.coins },
  { id: "flights_25", title: "Frequent Flyer", desc: "Complete 25 flights", rarity: "silver", target: 25, metric: (s) => s.state.runsPlayed },
  { id: "dist_25k", title: "Horizon Chaser", desc: "Fly 25,000 m lifetime", rarity: "silver", target: 25000, metric: (s) => s.state.lifetime.distance },
  { id: "coins_1500", title: "Treasure Nest", desc: "Earn 1,500 coins lifetime", rarity: "silver", target: 1500, metric: (s) => s.state.lifetime.coins },
  { id: "zenith_20", title: "High Flyer", desc: "Hit 20 zenith moments lifetime", rarity: "silver", target: 20, metric: (s) => s.state.lifetime.zeniths },
  { id: "flights_100", title: "Sky Veteran", desc: "Complete 100 flights", rarity: "gold", target: 100, metric: (s) => s.state.runsPlayed },
  { id: "dist_100k", title: "World Wanderer", desc: "Fly 100,000 m lifetime", rarity: "gold", target: 100000, metric: (s) => s.state.lifetime.distance },
  { id: "coins_5000", title: "Golden Nest", desc: "Earn 5,000 coins lifetime", rarity: "gold", target: 5000, metric: (s) => s.state.lifetime.coins },
  { id: "skins_all", title: "Fashionista", desc: "Own every bird skin", rarity: "gold", target: SKINS.length, metric: (s) => s.state.ownedSkins.length },
  { id: "biomes_all", title: "Cartographer", desc: "Visit every island biome", rarity: "silver", target: BIOMES.length, metric: (s) => s.state.biomesSeen.length },
  { id: "island_10", title: "Beyond the Map", desc: "Reach island 10 in one flight", rarity: "gold", target: 10, metric: (s) => s.state.farthestIsland + 1 },
  { id: "ghost_10", title: "Self Rival", desc: "Beat your own ghost 10 times", rarity: "platinum", target: 10, metric: (s) => s.state.lifetime.ghostBeats },
  { id: "zenith_75", title: "Stratosphere", desc: "Hit 75 zenith moments lifetime", rarity: "platinum", target: 75, metric: (s) => s.state.lifetime.zeniths },
  { id: "prestige", title: "Sunbird Prestige", desc: "Own Gold and VIP", rarity: "platinum", target: 1, metric: (s) => (s.state.gold && s.state.vip ? 1 : 0) },
  { id: "duel_1", title: "First Blood", desc: "Win a ranked duel", rarity: "bronze", target: 1, metric: (s) => s.state.duel.wins },
  { id: "duel_10", title: "Duelist", desc: "Win 10 ranked duels", rarity: "silver", target: 10, metric: (s) => s.state.duel.wins },
  { id: "duel_50", title: "Blademaster of the Sky", desc: "Win 50 ranked duels", rarity: "gold", target: 50, metric: (s) => s.state.duel.wins },
  { id: "daily_5", title: "Regular", desc: "Complete 5 daily challenges", rarity: "bronze", target: 5, metric: (s) => s.state.challenges.dailiesDone },
  { id: "daily_30", title: "Rain or Shine", desc: "Complete 30 daily challenges", rarity: "gold", target: 30, metric: (s) => s.state.challenges.dailiesDone },
  { id: "gauntlet_1", title: "Storm Runner", desc: "Clear a weekly gauntlet", rarity: "silver", target: 1, metric: (s) => s.state.challenges.gauntletsCleared },
  { id: "gauntlet_5", title: "Eye of the Storm", desc: "Clear 5 weekly gauntlets", rarity: "platinum", target: 5, metric: (s) => s.state.challenges.gauntletsCleared },
  { id: "races_25", title: "Pack Animal", desc: "Fly 25 mass races", rarity: "silver", target: 25, metric: (s) => s.state.racesRun },
  { id: "mastery_15", title: "Journeyman of the Air", desc: "Earn 15 total mastery stars", rarity: "gold", target: 15, metric: (s) => totalMastery(s) },
];

function totalMastery(s: SaveData): number {
  const LEVELS = [3, 10, 25, 50, 100];
  let stars = 0;
  for (const runs of Object.values(s.state.mastery)) for (const need of LEVELS) if (runs >= need) stars++;
  return stars;
}

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
