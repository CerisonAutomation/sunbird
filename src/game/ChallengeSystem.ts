/**
 * Shareable challenge system.
 * Encodes score, seed, and skin into a URL hash.
 * When a player opens a challenge URL, they see the target score
 * and play the same hill to beat it.
 */

export type ChallengeData = {
  from: string;      // player name who set the challenge
  score: number;     // target score to beat
  distance: number;  // target distance
  seed: string;      // same hill seed
  skin: string;      // skin used
  mode: string;      // game mode
};

export class ChallengeSystem {
  /** Encode a challenge into a URL hash */
  static createChallengeUrl(data: ChallengeData, baseUrl = window.location.origin): string {
    const params = new URLSearchParams();
    params.set("f", data.from.slice(0, 16));
    params.set("s", String(data.score));
    params.set("d", String(Math.round(data.distance)));
    params.set("h", data.seed);
    params.set("k", data.skin);
    params.set("m", data.mode);
    return `${baseUrl}/#${params.toString()}`;
  }

  /** Decode a challenge from the current URL hash */
  static parseChallenge(): ChallengeData | null {
    const hash = window.location.hash.slice(1);
    if (!hash) return null;
    try {
      const params = new URLSearchParams(hash);
      const score = Number(params.get("s"));
      if (!score || score <= 0) return null;
      return {
        from: params.get("f") || "Unknown",
        score,
        distance: Number(params.get("d")) || 0,
        seed: params.get("h") || "",
        skin: params.get("k") || "sunbird",
        mode: params.get("m") || "daytrip",
      };
    } catch {
      return null;
    }
  }

  /** Clear the challenge from URL after accepting */
  static clearChallenge(): void {
    history.replaceState(null, "", window.location.pathname);
  }
}
