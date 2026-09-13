/**
 * Daily challenge system.
 * Every player gets the same hill (seed based on date).
 * Top scores are tracked in localStorage leaderboard.
 * Changes each day at midnight.
 */

export type DailyChallengeResult = {
  date: string;
  score: number;
  distance: number;
  rank: number;
  totalPlayers: number;
  isNewBest: boolean;
};

const STORAGE_KEY = "sunbird.daily";

export class DailyChallenge {
  /** Get today's seed (same for all players) */
  static getTodaySeed(): string {
    const d = new Date();
    return `daily-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  /** Get the current day's seed for display */
  static getDayLabel(): string {
    const d = new Date();
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return `${days[d.getDay()]}'s Challenge`;
  }

  /** Get time until next challenge (midnight) */
  static getTimeUntilReset(): string {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const diff = midnight.getTime() - now.getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h ${m}m`;
  }

  /** Record a daily challenge score */
  static recordScore(score: number, distance: number): DailyChallengeResult {
    const date = this.getTodaySeed();
    const key = `${STORAGE_KEY}.${date}`;
    let scores: { score: number; distance: number }[] = [];
    try {
      const raw = localStorage.getItem(key);
      scores = raw ? JSON.parse(raw) : [];
    } catch { /* ignore */ }

    const prevBest = scores[0]?.score ?? 0;
    scores.push({ score, distance });
    scores.sort((a, b) => b.score - a.score);
    if (scores.length > 100) scores.length = 100;

    const isNewBest = score > prevBest;
    const rank = scores.findIndex(s => s.score <= score) + 1;

    try {
      localStorage.setItem(key, JSON.stringify(scores));
    } catch { /* ignore */ }

    return {
      date,
      score,
      distance,
      rank,
      totalPlayers: scores.length,
      isNewBest,
    };
  }

  /** Get today's top scores */
  static getTopScores(n = 10): { score: number; distance: number }[] {
    const date = this.getTodaySeed();
    const key = `${STORAGE_KEY}.${date}`;
    try {
      const raw = localStorage.getItem(key);
      const scores: { score: number; distance: number }[] = raw ? JSON.parse(raw) : [];
      return scores.slice(0, n);
    } catch {
      return [];
    }
  }

  /** Check if player has played today's challenge */
  static hasPlayedToday(): boolean {
    const date = this.getTodaySeed();
    const key = `${STORAGE_KEY}.${date}`;
    try {
      const raw = localStorage.getItem(key);
      const scores: unknown[] = raw ? JSON.parse(raw) : [];
      return scores.length > 0;
    } catch {
      return false;
    }
  }
}
