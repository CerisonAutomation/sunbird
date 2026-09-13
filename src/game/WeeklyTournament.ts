/**
 * Weekly tournament system.
 * Every player gets the same hill (seed based on the week's Monday).
 * Top scores are tracked in localStorage leaderboard.
 * Changes every Monday at midnight.
 */

export type WeeklyTournamentResult = {
  weekLabel: string;
  score: number;
  distance: number;
  rank: number;
  totalPlayers: number;
  isNewBest: boolean;
};

const STORAGE_KEY = "sunbird.weekly";

export class WeeklyTournament {
  /** Get the Monday-based seed for the current week (same for all players) */
  static getWeekSeed(): string {
    const d = new Date();
    // Find the Monday of this week
    const day = d.getDay(); // 0=Sun, 1=Mon, ...
    const diff = day === 0 ? 6 : day - 1; // days since Monday
    const monday = new Date(d);
    monday.setDate(d.getDate() - diff);
    return `weekly-${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
  }

  /** Get the current week's label for display */
  static getWeekLabel(): string {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(d);
    monday.setDate(d.getDate() - diff);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (dt: Date) => `${dt.getMonth() + 1}/${dt.getDate()}`;
    return `Week of ${fmt(monday)} – ${fmt(sunday)}`;
  }

  /** Get time until next tournament (next Monday at midnight) */
  static getTimeUntilReset(): string {
    const now = new Date();
    const day = now.getDay();
    // Days until next Monday: if today is Monday (1), next Monday is 7 days away
    const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7 || 7;
    const nextMonday = new Date(now);
    nextMonday.setDate(now.getDate() + daysUntilMonday);
    nextMonday.setHours(0, 0, 0, 0);
    const diff = nextMonday.getTime() - now.getTime();
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    return `${d}d ${h}h`;
  }

  /** Record a weekly tournament score */
  static recordScore(score: number, distance: number): WeeklyTournamentResult {
    const weekSeed = this.getWeekSeed();
    const key = `${STORAGE_KEY}.${weekSeed}`;
    let scores: { score: number; distance: number }[] = [];
    try {
      const raw = localStorage.getItem(key);
      scores = raw ? JSON.parse(raw) : [];
    } catch { /* ignore */ }

    const prevBest = scores[0]?.score ?? 0;
    scores.push({ score, distance });
    scores.sort((a, b) => b.score - a.score);
    if (scores.length > 500) scores.length = 500;

    const isNewBest = score > prevBest;
    const rank = scores.findIndex(s => s.score <= score) + 1;

    try {
      localStorage.setItem(key, JSON.stringify(scores));
    } catch { /* ignore */ }

    return {
      weekLabel: this.getWeekLabel(),
      score,
      distance,
      rank,
      totalPlayers: scores.length,
      isNewBest,
    };
  }

  /** Get this week's top scores */
  static getTopScores(n = 10): { score: number; distance: number }[] {
    const weekSeed = this.getWeekSeed();
    const key = `${STORAGE_KEY}.${weekSeed}`;
    try {
      const raw = localStorage.getItem(key);
      const scores: { score: number; distance: number }[] = raw ? JSON.parse(raw) : [];
      return scores.slice(0, n);
    } catch {
      return [];
    }
  }

  /** Check if player has played this week's tournament */
  static hasPlayedThisWeek(): boolean {
    const weekSeed = this.getWeekSeed();
    const key = `${STORAGE_KEY}.${weekSeed}`;
    try {
      const raw = localStorage.getItem(key);
      const scores: unknown[] = raw ? JSON.parse(raw) : [];
      return scores.length > 0;
    } catch {
      return false;
    }
  }
}
