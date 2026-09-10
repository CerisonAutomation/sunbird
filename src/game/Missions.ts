import { SeededRandom } from "./math";
import type { SaveData } from "./SaveData";

export type StatKey =
  | "clouds"
  | "island"
  | "coins"
  | "perfects"
  | "distance"
  | "fever"
  | "zenith"
  | "pickups";

export type RunStats = Record<StatKey, number>;

export type MissionDef = {
  id: string;
  title: string;
  desc: string;
  target: number;
  kind: StatKey;
};

export const MISSION_DEFS: MissionDef[] = [
  { id: "clouds5", title: "Sky Tickles", desc: "Touch 5 clouds in one run", target: 5, kind: "clouds" },
  { id: "island3", title: "Archipelago", desc: "Reach island 3", target: 3, kind: "island" },
  { id: "coins25", title: "Gold Rush", desc: "Collect 25 coins in one run", target: 25, kind: "coins" },
  { id: "perfects5", title: "Slide Poet", desc: "Land 5 perfect slides in one run", target: 5, kind: "perfects" },
  { id: "fever1", title: "Catch Fire", desc: "Enter fever mode", target: 1, kind: "fever" },
  { id: "zenith3", title: "Zenith Chaser", desc: "Hit 3 zenith moments in one run", target: 3, kind: "zenith" },
  { id: "distance2k", title: "Marathon Glide", desc: "Travel 2,000 m in one run", target: 2000, kind: "distance" },
  { id: "pickups6", title: "Forager", desc: "Grab 6 power-ups in one run", target: 6, kind: "pickups" },
  { id: "island5", title: "Far Horizon", desc: "Reach island 5", target: 5, kind: "island" },
  { id: "distance5k", title: "Sun Runner", desc: "Travel 5,000 m in one run", target: 5000, kind: "distance" },
];

export type MissionView = {
  def: MissionDef;
  progress: number;
  done: boolean;
  completedBefore: boolean;
};

export type QuestDef = {
  id: string;
  kind: StatKey;
  target: number;
  reward: number;
  label: string;
};

const QUEST_POOL: Omit<QuestDef, "id">[] = [
  { kind: "coins", target: 15, reward: 60, label: "Collect 15 coins in a run" },
  { kind: "coins", target: 30, reward: 120, label: "Collect 30 coins in a run" },
  { kind: "clouds", target: 2, reward: 80, label: "Touch 2 clouds in a run" },
  { kind: "clouds", target: 4, reward: 150, label: "Touch 4 clouds in a run" },
  { kind: "perfects", target: 3, reward: 80, label: "Land 3 perfect slides" },
  { kind: "perfects", target: 6, reward: 160, label: "Land 6 perfect slides" },
  { kind: "distance", target: 800, reward: 60, label: "Fly 800 m in a run" },
  { kind: "distance", target: 1500, reward: 120, label: "Fly 1,500 m in a run" },
  { kind: "island", target: 2, reward: 100, label: "Reach island 2" },
  { kind: "island", target: 3, reward: 200, label: "Reach island 3" },
  { kind: "zenith", target: 1, reward: 80, label: "Hit a zenith moment" },
  { kind: "zenith", target: 3, reward: 170, label: "Hit 3 zenith moments" },
  { kind: "fever", target: 1, reward: 100, label: "Enter fever mode" },
  { kind: "pickups", target: 3, reward: 90, label: "Grab 3 power-ups" },
];

export type QuestView = {
  def: QuestDef;
  progress: number;
  done: boolean;
  claimed: boolean;
};

export type QuestReward = { id: string; reward: number; label: string };

export class Missions {
  private questCache = new Map<string, QuestDef[]>();

  constructor(private save: SaveData) {}

  view(stats: RunStats | null): MissionView[] {
    const completed = new Set(this.save.state.completedMissions);
    return MISSION_DEFS.map((def) => {
      const completedBefore = completed.has(def.id);
      const current = stats ? stats[def.kind] : 0;
      const progress = completedBefore ? def.target : Math.min(def.target, current);
      return { def, progress, done: completedBefore || progress >= def.target, completedBefore };
    });
  }

  applyRun(stats: RunStats): string[] {
    const newly: string[] = [];
    for (const def of MISSION_DEFS) {
      if (stats[def.kind] >= def.target && this.save.completeMission(def.id)) newly.push(def.id);
    }
    return newly;
  }

  /** VIP members receive a fourth (bonus) quest every day. */
  dailyQuests(date: string): QuestDef[] {
    const want = this.save.isVipActive() ? 4 : 3;
    const key = `${date}:${want}`;
    const cached = this.questCache.get(key);
    if (cached) return cached;
    const rng = new SeededRandom(`${date}:quests`);
    const picked: QuestDef[] = [];
    const kinds = new Set<StatKey>();
    let guard = 0;
    while (picked.length < want && guard++ < 80) {
      const q = QUEST_POOL[rng.int(0, QUEST_POOL.length)]!;
      if (kinds.has(q.kind)) continue;
      kinds.add(q.kind);
      picked.push({ ...q, id: `${date}:${q.kind}:${q.target}`, reward: picked.length === 3 ? Math.round(q.reward * 1.5) : q.reward });
    }
    this.questCache.set(key, picked);
    return picked;
  }

  questView(date: string, stats: RunStats | null): QuestView[] {
    const claimed = this.save.questsClaimed(date);
    return this.dailyQuests(date).map((def) => {
      const isClaimed = claimed.includes(def.id);
      const progress = isClaimed ? def.target : Math.min(def.target, stats ? stats[def.kind] : 0);
      return { def, progress, done: isClaimed || progress >= def.target, claimed: isClaimed };
    });
  }

  claimQuests(date: string, stats: RunStats): QuestReward[] {
    const out: QuestReward[] = [];
    const claimed = this.save.questsClaimed(date);
    for (const def of this.dailyQuests(date)) {
      if (stats[def.kind] >= def.target && !claimed.includes(def.id)) {
        this.save.claimQuest(date, def.id);
        this.save.addCoins(def.reward);
        out.push({ id: def.id, reward: def.reward, label: def.label });
      }
    }
    return out;
  }
}
