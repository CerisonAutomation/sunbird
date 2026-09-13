import { dateSeed } from "./math";

export type ChallengeStatus = "pending" | "accepted" | "completed" | "expired";

export type FriendChallenge = {
  id: string;
  challengerId: string;
  challengerName: string;
  challengerValue: number;
  challengerSeed: string;
  createdAt: string;
  expiresAt: string;
  status: ChallengeStatus;
  result?: "won" | "lost" | "tied";
};

export type ClubChallenge = {
  id: string;
  seed: string;
  metric: string;
  expiresAt: string;
};

export type ReplayData = {
  id: string;
  seed: string;
  distance: number;
  recordedAt: string;
  samples: unknown[];
};

export type SocialData = {
  challenges: FriendChallenge[];
  clubChallenges: ClubChallenge[];
  savedReplays: ReplayData[];
};

export function emptySocialData(): SocialData {
  return { challenges: [], clubChallenges: [], savedReplays: [] };
}

type Saveable = { state: { social: SocialData }; persist(): void };

export class SocialSystem {
  private readonly save: Saveable;

  constructor(save: Saveable) {
    this.save = save;
    if (!this.save.state.social) {
      (this.save.state as { social: SocialData }).social = emptySocialData();
    }
  }

  private get social(): SocialData {
    return this.save.state.social;
  }

  createChallenge(challengerId: string, challengerName: string, challengerValue: number, challengerSeed: string): FriendChallenge {
    const s = this.social;
    const challenge: FriendChallenge = {
      id: `${challengerId}-${Date.now()}`,
      challengerId, challengerName, challengerValue, challengerSeed,
      createdAt: dateSeed(), expiresAt: this.dateSeedDaysLater(3) };
    s.challenges.push(challenge); this.save.persist(); return challenge;
  }

  /** Accept a pending challenge so a finished run can complete it. */
  acceptChallenge(challengeId: string): boolean {
    const ch = this.social.challenges.find(c => c.id === challengeId);
    if (!ch || ch.status !== "pending") return false;
    if (this.isExpired(ch)) { ch.status = "expired"; this.save.persist(); return false; }
    ch.status = "accepted"; this.save.persist(); return true;
  }

  completeChallenge(challengeId: string, myValue: number): "won" | "lost" | "tied" | null {
    const ch = this.social.challenges.find(c => c.id === challengeId);
    if (!ch || ch.status !== "accepted") return null;
    if (this.isExpired(ch)) { ch.status = "expired"; this.save.persist(); return null; }
    const result: "won" | "lost" | "tied" = myValue > ch.challengerValue ? "won" : myValue < ch.challengerValue ? "lost" : "tied";
    ch.result = result; this.save.persist(); return result;
  }

  getActiveChallenges(): FriendChallenge[] {
    // Sweep expiries lazily so stale challenges never linger as "active".
    let dirty = false;
    for (const c of this.social.challenges) {
      if ((c.status === "pending" || c.status === "accepted") && this.isExpired(c)) { c.status = "expired"; dirty = true; }
    }
    if (dirty) this.save.persist();
    return this.social.challenges.filter(c => c.status === "pending" || c.status === "accepted");
  }

  private isExpired(c: FriendChallenge): boolean { return c.expiresAt < dateSeed(); }

  saveReplay(data: ReplayData): void { const s = this.social; s.savedReplays.unshift(data); if (s.savedReplays.length > 10) s.savedReplays.splice(10); this.save.persist(); }

  getReplays(): ReplayData[] { return this.social.savedReplays; }

  private makeWeeklyChallenge(): ClubChallenge {
    return { id: `club-${dateSeed()}`, seed: dateSeed(), metric: "distance", expiresAt: this.dateSeedDaysLater(7) };
  }

  getClubChallenge(): ClubChallenge {
    const s = this.social;
    const active = s.clubChallenges.find(c => c.expiresAt >= dateSeed());
    if (active) return active;
    const c = this.makeWeeklyChallenge();
    s.clubChallenges.push(c);
    this.save.persist();
    return c;
  }

  private dateSeedDaysLater(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return dateSeed(d);
  }
}
