/**
 * Global leaderboard backed by Firebase Firestore.
 *
 * Uses the Firebase SDK directly — Auth (Google Sign-in) + Firestore.
 * Falls back to localStorage when Firebase is unavailable or user is not signed in.
 */
import {
  submitScore as fbSubmit,
  fetchTop as fbFetchTop,
  getMyRank as fbGetRank,
  getDisplayName,
  getCurrentUser,
  signInWithGoogle,
  signInAnon,
  signOutUser,
  ensureAuth,
} from "../firebase";

export type GlobalEntry = {
  rank: number;
  name: string;
  distance: number;
  score: number;
  skin: string;
  date: string;
  country: string;
};

const LOCAL_KEY = "sunbird.global_scores";

export class GlobalLeaderboard {
  private useFirestore = false;

  constructor() {
    // Check if Firebase is available
    this.useFirestore = typeof window !== "undefined";
  }

  get isGlobal(): boolean {
    return this.useFirestore && !!getCurrentUser();
  }

  /** Sign in with Google. Returns the display name or null. */
  async signIn(): Promise<string | null> {
    const user = await signInWithGoogle();
    return user ? getDisplayName() : null;
  }

  /** Sign out. */
  async signOut(): Promise<void> {
    await signOutUser();
  }

  /** Submit a score — tries Firestore first, falls back to localStorage. */
  async submit(
    name: string,
    distance: number,
    score: number,
    skin: string,
    mode = "daytrip",
  ): Promise<{ rank: number; total: number }> {
    // Auto-sign-in anonymously if no user
    let user = getCurrentUser();
    if (!user) user = await ensureAuth();

    if (user) {
      try {
        const coins = 0;
        const perfects = 0;
        const rank = await fbSubmit(mode, name, score, distance, coins, perfects, skin);
        if (rank > 0) return { rank, total: rank };
      } catch {
        /* Firestore failure — fall through to local */
      }
    }
    return this._submitLocal(name, distance, score, skin);
  }

  private _submitLocal(name: string, distance: number, score: number, skin: string): { rank: number; total: number } {
    const entry: GlobalEntry = {
      rank: 0, name, distance, score, skin,
      date: new Date().toISOString(),
      country: "",
    };
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      const scores: GlobalEntry[] = raw ? (JSON.parse(raw) as GlobalEntry[]) : [];
      scores.push(entry);
      scores.sort((a, b) => b.score - a.score);
      if (scores.length > 1000) scores.length = 1000;
      scores.forEach((s, i) => { s.rank = i + 1; });
      localStorage.setItem(LOCAL_KEY, JSON.stringify(scores));
      const rank = scores.indexOf(entry) + 1;
      return { rank, total: scores.length };
    } catch {
      return { rank: 0, total: 0 };
    }
  }

  /** Get top N scores — tries Firestore first, falls back to localStorage. */
  async getTop(n = 10): Promise<GlobalEntry[]> {
    const user = getCurrentUser();
    if (user) {
      try {
        const scores = await fbFetchTop("daytrip", n);
        if (scores.length > 0) {
          return scores.map((s, i) => ({
            rank: i + 1,
            name: s.name,
            distance: s.distance,
            score: s.score,
            skin: s.skin ?? "",
            date: new Date(s.ts).toISOString(),
            country: "",
          }));
        }
      } catch {
        /* fall through */
      }
    }
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      const scores: GlobalEntry[] = raw ? (JSON.parse(raw) as GlobalEntry[]) : [];
      return scores.slice(0, n);
    } catch {
      return [];
    }
  }

  /** Get player's rank. */
  async getRank(score: number): Promise<{ rank: number; total: number }> {
    const user = getCurrentUser();
    if (user) {
      try {
        const rank = await fbGetRank("daytrip", score);
        if (rank > 0) return { rank, total: rank };
      } catch {
        /* fall through */
      }
    }
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      const scores: GlobalEntry[] = raw ? (JSON.parse(raw) as GlobalEntry[]) : [];
      const rank = scores.filter((s) => s.score > score).length + 1;
      return { rank, total: scores.length };
    } catch {
      return { rank: 0, total: 0 };
    }
  }
}
