/**
 * Leaderboard system with personal bests and mode-specific high scores.
 * Stores top 10 scores per mode with timestamps and stats.
 */

export type LeaderEntry = {
  rank: number;
  score: number;
  distance: number;
  coins: number;
  perfects: number;
  mode: string;
  date: string;
  skin: string;
};

export type LeaderBoard = {
  mode: string;
  entries: LeaderEntry[];
};

const STORAGE_KEY = "sunbird.leaderboard";
const MAX_ENTRIES = 10;

export class Leaderboard {
  private boards: Map<string, LeaderEntry[]> = new Map();

  constructor() {
    this.load();
  }

  /** Record a new score */
  record(
    mode: string,
    score: number,
    distance: number,
    coins: number,
    perfects: number,
    skin: string,
  ): { rank: number; isNewBest: boolean } {
    const entries = this.boards.get(mode) ?? [];
    const entry: LeaderEntry = {
      rank: 0,
      score,
      distance,
      coins,
      perfects,
      mode,
      date: new Date().toISOString(),
      skin,
    };

    // Find insertion point (sorted by score descending)
    let rank = entries.findIndex((e) => score > e.score);
    if (rank === -1) rank = entries.length;
    entries.splice(rank, 0, entry);

    // Trim to max entries
    if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;

    // Update ranks
    entries.forEach((e, i) => (e.rank = i + 1));

    this.boards.set(mode, entries);
    this.save();

    return { rank: rank + 1, isNewBest: rank === 0 };
  }

  /** Get high scores for a mode */
  getScores(mode: string): LeaderEntry[] {
    return this.boards.get(mode) ?? [];
  }

  /** Get personal best across all modes */
  getPersonalBest(): LeaderEntry | null {
    let best: LeaderEntry | null = null;
    for (const entries of this.boards.values()) {
      for (const e of entries) {
        if (!best || e.score > best.score) best = e;
      }
    }
    return best;
  }

  /** Get best distance across all modes */
  getBestDistance(): number {
    let best = 0;
    for (const entries of this.boards.values()) {
      for (const e of entries) {
        if (e.distance > best) best = e.distance;
      }
    }
    return best;
  }

  /** Get total coins earned across all runs */
  getTotalCoins(): number {
    let total = 0;
    for (const entries of this.boards.values()) {
      for (const e of entries) total += e.coins;
    }
    return total;
  }

  /** Get total perfect landings */
  getTotalPerfects(): number {
    let total = 0;
    for (const entries of this.boards.values()) {
      for (const e of entries) total += e.perfects;
    }
    return total;
  }

  /** Get stats for profile screen */
  getStats(): {
    totalRuns: number;
    totalDistance: number;
    totalCoins: number;
    totalPerfects: number;
    bestScore: number;
    bestDistance: number;
    modesPlayed: number;
  } {
    let totalRuns = 0;
    let totalDistance = 0;
    let totalCoins = 0;
    let totalPerfects = 0;
    let bestScore = 0;
    let bestDistance = 0;
    const modesPlayed = this.boards.size;

    for (const entries of this.boards.values()) {
      for (const e of entries) {
        totalRuns++;
        totalDistance += e.distance;
        totalCoins += e.coins;
        totalPerfects += e.perfects;
        if (e.score > bestScore) bestScore = e.score;
        if (e.distance > bestDistance) bestDistance = e.distance;
      }
    }

    return { totalRuns, totalDistance, totalCoins, totalPerfects, bestScore, bestDistance, modesPlayed };
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        for (const [mode, entries] of Object.entries(data)) {
          this.boards.set(mode, entries as LeaderEntry[]);
        }
      }
    } catch {
      /* ignore */
    }
  }

  private save(): void {
    try {
      const data: Record<string, LeaderEntry[]> = {};
      for (const [mode, entries] of this.boards) {
        data[mode] = entries;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }

  /** Clear all scores (for testing) */
  clear(): void {
    this.boards.clear();
    localStorage.removeItem(STORAGE_KEY);
  }
}
