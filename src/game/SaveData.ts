import {
  ADS_PER_DAY,
  AD_MIN_RUN_GAP,
  INTERSTITIAL_EVERY,
  NEST_MULT_PER_LEVEL,
  SAVE_KEY,
  SAVE_KEY_V1,
  VIP_DAILY_GIFT,
  VIP_DAYS,
} from "./constants";
import { dateSeed } from "./math";
import { defaultRival, rankSeasonId, ratingDelta, RIVAL_BASE_RATING, seasonReward, softResetRating, streakBonus, type RivalMatch, type RivalState } from "./pvp";
import { seasonId } from "./SeasonPass";
import { emptyTournamentState, type TournamentState } from "./Tournaments";

export type HighScore = {
  date: string;
  distance: number;
  coins: number;
  score: number;
  vip?: boolean;
  island?: number;
};

export type Quality = "auto" | "high" | "low";

export type Settings = {
  mute: boolean;
  music: boolean;
  musicVolume: number;
  sfxVolume: number;
  haptics: boolean;
  reduceMotion: boolean;
  quality: Quality;
};

export type LifetimeStats = {
  distance: number;
  coins: number;
  zeniths: number;
  ghostBeats: number;
};

export type SeasonState = {
  id: string;
  xp: number;
  claimedFree: number[];
  claimedPremium: number[];
};

export type SaveState = {
  bestScore: number;
  bestDistance: number;
  totalCoins: number;
  wallet: number;
  nestLevel: number;
  completedMissions: string[];
  highScores: HighScore[];
  gold: boolean;
  vip: boolean;
  /** epoch ms — a monthly subscription really expires */
  vipUntil: number;
  vipLastClaim: string;
  ads: { day: string; count: number; lastRun: number };
  ownedSkins: string[];
  activeSkin: string;
  armedBoosts: string[];
  settings: Settings;
  quests: { date: string; claimed: string[] };
  streak: { last: string; days: number; claimedDate: string };
  redeemedCodes: string[];
  runsPlayed: number;
  lifetime: LifetimeStats;
  achievements: string[];
  season: SeasonState;
  deviceId: string;
  referralCode: string;
  referralRedeemed: boolean;
  farthestIsland: number;
  biomesSeen: string[];
  tutorialRuns: number;
  /** rolling flow-calibration estimate */
  skill: number;
  skillSamples: number;
  bestAltitude: number;
  bestCombo: number;
  /** Weekly tournament progress + permanently-won cosmetics. */
  tournaments: TournamentState;
  /** Cosmetic trail currently equipped ("" = skin default). */
  activeTrail: string;
  pilotName: string;
  bestPlace: number;
  racesRun: number;
  /** On-device Rival rating for the simulated 40-bird field. Local only —
   *  never synced, never presented as a server rank. */
  rival: RivalState;
  /** Head-to-head duel record (local ranked 1v1). */
  duel: DuelState;
  /** Monthly ranked season bookkeeping: soft reset + peak-division reward. */
  rankSeason: { id: string; peak: number };
  /** Daily challenge / weekly gauntlet completion state. */
  challenges: ChallengeState;
  /** 28-day login calendar, separate from the streak. */
  calendar: { cycleDay: number; lastClaim: string };
  /** Runs flown per mode, feeding mode mastery levels. */
  mastery: Record<string, number>;
  /** Campaign chapters whose rewards were claimed. */
  campaignClaimed: string[];
  /** Weekly-event / monthly-theme progress windows. */
  events: { week: string; clearsThisWeek: number; month: string; clearsThisMonth: number; claimedTrailMonth: string };
};

export type DuelState = {
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
};

export type ChallengeState = {
  dailyDate: string;
  dailyDone: boolean;
  dailiesDone: number;
  gauntletWeek: string;
  gauntletDone: number[];
  gauntletsCleared: number;
};

const DEFAULT_SETTINGS: Settings = {
  mute: false,
  music: true,
  musicVolume: 0.8,
  sfxVolume: 0.9,
  haptics: true,
  reduceMotion: false,
  quality: "auto",
};

function makeDeviceId(): string {
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function codeFromId(id: string): string {
  const clean = id.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return `SUN-${clean.slice(-6).padStart(6, "0")}`;
}

function defaults(): SaveState {
  const deviceId = makeDeviceId();
  return {
    bestScore: 0,
    bestDistance: 0,
    totalCoins: 0,
    wallet: 0,
    nestLevel: 0,
    completedMissions: [],
    highScores: [],
    gold: false,
    vip: false,
    vipUntil: 0,
    vipLastClaim: "",
    ads: { day: "", count: 0, lastRun: -999 },
    ownedSkins: ["sunbird"],
    activeSkin: "sunbird",
    armedBoosts: [],
    settings: { ...DEFAULT_SETTINGS },
    quests: { date: "", claimed: [] },
    streak: { last: "", days: 0, claimedDate: "" },
    redeemedCodes: [],
    runsPlayed: 0,
    lifetime: { distance: 0, coins: 0, zeniths: 0, ghostBeats: 0 },
    achievements: [],
    season: { id: seasonId(), xp: 0, claimedFree: [], claimedPremium: [] },
    deviceId,
    referralCode: codeFromId(deviceId),
    referralRedeemed: false,
    farthestIsland: 0,
    biomesSeen: [],
    tutorialRuns: 0,
    skill: 0.25,
    skillSamples: 0,
    bestAltitude: 0,
    bestCombo: 0,
    tournaments: emptyTournamentState(),
    activeTrail: "",
    pilotName: "",
    bestPlace: 0,
    racesRun: 0,
    rival: defaultRival(),
    duel: { wins: 0, losses: 0, streak: 0, bestStreak: 0 },
    rankSeason: { id: rankSeasonId(), peak: RIVAL_BASE_RATING },
    challenges: { dailyDate: "", dailyDone: false, dailiesDone: 0, gauntletWeek: "", gauntletDone: [], gauntletsCleared: 0 },
    calendar: { cycleDay: 0, lastClaim: "" },
    mastery: {},
    campaignClaimed: [],
    events: { week: "", clearsThisWeek: 0, month: "", clearsThisMonth: 0, claimedTrailMonth: "" },
  };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

function numArr(v: unknown): number[] {
  return Array.isArray(v) ? v.map(Number).filter((n) => Number.isFinite(n)) : [];
}

function parseRival(v: unknown): RivalState {
  const d = defaultRival();
  if (!v || typeof v !== "object") return d;
  const p = v as Partial<RivalState> & { matches?: unknown };
  const matches: RivalMatch[] = Array.isArray(p.matches)
    ? (p.matches as unknown[])
        .filter((m): m is RivalMatch => !!m && typeof m === "object")
        .map((m) => {
          const r = m as Partial<RivalMatch>;
          return {
            place: num(r.place),
            field: Math.max(2, num(r.field)),
            mode: String(r.mode ?? "massrace"),
            date: String(r.date ?? ""),
            won: Boolean(r.won),
          };
        })
        .slice(-8)
    : [];
  return {
    rating: num(p.rating) || d.rating,
    wins: num(p.wins),
    losses: num(p.losses),
    streak: num(p.streak),
    bestStreak: num(p.bestStreak),
    matches,
  };
}

export class SaveData {
  state: SaveState;

  constructor() {
    this.state = this.load();
  }

  private load(): SaveState {
    const d = defaults();
    try {
      const raw = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem(SAVE_KEY_V1);
      if (!raw) {
        this.persistNow(d);
        return d;
      }
      const p = JSON.parse(raw) as Partial<SaveState> & { settings?: Partial<Settings> };
      const owned = strArr(p.ownedSkins);
      if (!owned.includes("sunbird")) owned.unshift("sunbird");
      const quality = p.settings?.quality;
      const deviceId = typeof p.deviceId === "string" && p.deviceId ? p.deviceId : d.deviceId;
      return {
        bestScore: num(p.bestScore),
        bestDistance: num(p.bestDistance),
        totalCoins: num(p.totalCoins),
        wallet: p.wallet === undefined ? num(p.totalCoins) : num(p.wallet),
        nestLevel: num(p.nestLevel),
        completedMissions: strArr(p.completedMissions),
        highScores: Array.isArray(p.highScores)
          ? p.highScores
              .map((h) => ({
                date: String(h.date ?? ""),
                distance: num(h.distance),
                coins: num(h.coins),
                score: num(h.score),
                vip: Boolean(h.vip),
                island: num(h.island),
              }))
              .slice(0, 8)
          : [],
        gold: Boolean(p.gold),
        vip: Boolean(p.vip),
        vipUntil: num(p.vipUntil),
        vipLastClaim: typeof p.vipLastClaim === "string" ? p.vipLastClaim : "",
        ads:
          p.ads && typeof p.ads.day === "string"
            ? { day: p.ads.day, count: num(p.ads.count), lastRun: num(p.ads.lastRun) }
            : { day: "", count: 0, lastRun: -999 },
        ownedSkins: owned,
        activeSkin: typeof p.activeSkin === "string" ? p.activeSkin : "sunbird",
        armedBoosts: strArr(p.armedBoosts),
        settings: {
          mute: Boolean(p.settings?.mute),
          music: p.settings?.music === undefined ? true : Boolean(p.settings.music),
          musicVolume:
            p.settings?.musicVolume !== undefined
              ? Math.max(0, Math.min(1, Number(p.settings.musicVolume) || 0))
              : 0.8,
          sfxVolume:
            p.settings?.sfxVolume !== undefined
              ? Math.max(0, Math.min(1, Number(p.settings.sfxVolume) || 0))
              : 0.9,
          haptics: p.settings?.haptics === undefined ? true : Boolean(p.settings.haptics),
          reduceMotion: Boolean(p.settings?.reduceMotion),
          quality: quality === "high" || quality === "low" ? quality : "auto",
        },
        quests:
          p.quests && typeof p.quests.date === "string"
            ? { date: p.quests.date, claimed: strArr(p.quests.claimed) }
            : d.quests,
        streak:
          p.streak && typeof p.streak.last === "string"
            ? { last: p.streak.last, days: num(p.streak.days), claimedDate: String(p.streak.claimedDate ?? "") }
            : d.streak,
        redeemedCodes: strArr(p.redeemedCodes),
        runsPlayed: num(p.runsPlayed),
        lifetime: {
          distance: num(p.lifetime?.distance),
          coins: num(p.lifetime?.coins),
          zeniths: num(p.lifetime?.zeniths),
          ghostBeats: num(p.lifetime?.ghostBeats),
        },
        achievements: strArr(p.achievements),
        season:
          p.season && typeof p.season.id === "string"
            ? {
                id: p.season.id,
                xp: num(p.season.xp),
                claimedFree: numArr(p.season.claimedFree),
                claimedPremium: numArr(p.season.claimedPremium),
              }
            : d.season,
        deviceId,
        referralCode: typeof p.referralCode === "string" && p.referralCode ? p.referralCode : codeFromId(deviceId),
        referralRedeemed: Boolean(p.referralRedeemed),
        farthestIsland: num(p.farthestIsland),
        biomesSeen: strArr(p.biomesSeen),
        tutorialRuns: num(p.tutorialRuns),
        skill: p.skill === undefined ? 0.25 : num(p.skill),
        skillSamples: num(p.skillSamples),
        bestAltitude: num(p.bestAltitude),
        bestCombo: num(p.bestCombo),
        tournaments:
          p.tournaments && typeof p.tournaments.week === "string"
            ? {
                week: p.tournaments.week,
                entries:
                  p.tournaments.entries && typeof p.tournaments.entries === "object"
                    ? (p.tournaments.entries as TournamentState["entries"])
                    : {},
                trails: strArr(p.tournaments.trails),
                titles: strArr(p.tournaments.titles),
              }
            : emptyTournamentState(),
        activeTrail: typeof p.activeTrail === "string" ? p.activeTrail : "",
        pilotName: typeof p.pilotName === "string" ? p.pilotName : "",
        bestPlace: num(p.bestPlace),
        racesRun: num(p.racesRun),
        rival: parseRival(p.rival),
        duel:
          p.duel && typeof p.duel === "object"
            ? { wins: num(p.duel.wins), losses: num(p.duel.losses), streak: num(p.duel.streak), bestStreak: num(p.duel.bestStreak) }
            : { wins: 0, losses: 0, streak: 0, bestStreak: 0 },
        rankSeason:
          p.rankSeason && typeof p.rankSeason.id === "string"
            ? { id: p.rankSeason.id, peak: num(p.rankSeason.peak) || RIVAL_BASE_RATING }
            : { id: rankSeasonId(), peak: RIVAL_BASE_RATING },
        challenges:
          p.challenges && typeof p.challenges === "object"
            ? {
                dailyDate: String(p.challenges.dailyDate ?? ""),
                dailyDone: Boolean(p.challenges.dailyDone),
                dailiesDone: num(p.challenges.dailiesDone),
                gauntletWeek: String(p.challenges.gauntletWeek ?? ""),
                gauntletDone: numArr(p.challenges.gauntletDone),
                gauntletsCleared: num(p.challenges.gauntletsCleared),
              }
            : d.challenges,
        calendar:
          p.calendar && typeof p.calendar === "object"
            ? { cycleDay: num(p.calendar.cycleDay), lastClaim: String(p.calendar.lastClaim ?? "") }
            : d.calendar,
        mastery:
          p.mastery && typeof p.mastery === "object" && !Array.isArray(p.mastery)
            ? Object.fromEntries(Object.entries(p.mastery as Record<string, unknown>).map(([k, v]) => [k, num(v)]))
            : {},
        campaignClaimed: strArr(p.campaignClaimed),
        events:
          p.events && typeof p.events === "object"
            ? {
                week: String((p.events as Record<string, unknown>).week ?? ""),
                clearsThisWeek: num((p.events as Record<string, unknown>).clearsThisWeek),
                month: String((p.events as Record<string, unknown>).month ?? ""),
                clearsThisMonth: num((p.events as Record<string, unknown>).clearsThisMonth),
                claimedTrailMonth: String((p.events as Record<string, unknown>).claimedTrailMonth ?? ""),
              }
            : d.events,
      };
    } catch {
      return d;
    }
  }

  private persistNow(state: SaveState): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }

  persist(): void {
    this.persistNow(this.state);
  }

  recordRun(distance: number, coins: number, score: number, date: string, island = 0, biomeId = ""): void {
    const s = this.state;
    s.totalCoins += coins;
    s.wallet += coins;
    s.runsPlayed += 1;
    s.tutorialRuns += 1;
    s.lifetime.distance += distance;
    s.lifetime.coins += coins;
    if (score > s.bestScore) s.bestScore = score;
    if (distance > s.bestDistance) s.bestDistance = distance;
    if (island > s.farthestIsland) s.farthestIsland = island;
    if (biomeId && !s.biomesSeen.includes(biomeId)) s.biomesSeen.push(biomeId);
    s.highScores.push({ date, distance, coins, score, vip: s.vip, island });
    s.highScores.sort((a, b) => b.score - a.score);
    s.highScores = s.highScores.slice(0, 8);
    this.persist();
  }

  addLifetimeZeniths(n: number): void {
    this.state.lifetime.zeniths += n;
    this.persist();
  }

  /** @returns true when a personal record was beaten (drives the record banner). */
  noteRecords(altitude: number, combo: number): { altitude: boolean; combo: boolean } {
    const out = { altitude: false, combo: false };
    if (altitude > this.state.bestAltitude) {
      this.state.bestAltitude = altitude;
      out.altitude = true;
    }
    if (combo > this.state.bestCombo) {
      this.state.bestCombo = combo;
      out.combo = true;
    }
    if (out.altitude || out.combo) this.persist();
    return out;
  }

  /** Records a mass-race result. @returns true when it is a new best placing. */
  noteRacePlace(place: number, field: number): boolean {
    this.state.racesRun += 1;
    const better = this.state.bestPlace === 0 || (place > 0 && place < this.state.bestPlace);
    if (better) this.state.bestPlace = place;
    this.persist();
    void field;
    return better;
  }

  /**
   * Records a ranked 40-bird result into the on-device Rival rating.
   * Returns the rating delta and any streak bonus actually granted.
   * Local only — never synced, never a server rank.
   */
  recordRivalResult(place: number, field: number, mode: string, date: string): { delta: number; bonus: number; streak: number } {
    const r = this.state.rival;
    const p = Math.max(1, Math.min(Math.max(2, field), Math.floor(place)));
    const f = Math.max(2, Math.floor(field));
    const delta = ratingDelta(p, f);
    const won = p <= Math.max(1, Math.ceil(f * 0.25));
    r.rating = Math.max(0, r.rating + delta);
    this.state.rankSeason.peak = Math.max(this.state.rankSeason.peak, r.rating);
    if (won) {
      r.wins += 1;
      r.streak += 1;
      r.bestStreak = Math.max(r.bestStreak, r.streak);
    } else {
      r.losses += 1;
      r.streak = 0;
    }
    r.matches.push({ place: p, field: f, mode, date, won });
    if (r.matches.length > 8) r.matches.splice(0, r.matches.length - 8);
    const bonus = won ? streakBonus(r.streak) : 0;
    if (bonus > 0) {
      this.state.wallet += bonus;
      this.state.totalCoins += bonus;
    }
    this.persist();
    return { delta, bonus, streak: r.streak };
  }

  /**
   * Monthly ranked season rollover: soft-reset the rating toward base and pay
   * a coin reward for the peak division reached last season.
   * @returns the reward paid, or null when no rollover happened.
   */
  ensureRankSeason(): { coins: number; division: string } | null {
    const id = rankSeasonId();
    if (this.state.rankSeason.id === id) return null;
    const reward = seasonReward(this.state.rankSeason.peak);
    this.state.rival.rating = softResetRating(this.state.rival.rating);
    this.state.rival.streak = 0;
    this.state.rankSeason = { id, peak: this.state.rival.rating };
    this.state.wallet += reward.coins;
    this.state.totalCoins += reward.coins;
    this.persist();
    return { coins: reward.coins, division: reward.division.name };
  }

  /** Head-to-head duel result. Rating swing is a flat ±16 vs the duelist. */
  recordDuelResult(won: boolean, date: string): { delta: number; streak: number } {
    const d = this.state.duel;
    const delta = won ? 16 : -16;
    this.state.rival.rating = Math.max(0, this.state.rival.rating + delta);
    this.state.rankSeason.peak = Math.max(this.state.rankSeason.peak, this.state.rival.rating);
    if (won) {
      d.wins += 1;
      d.streak += 1;
      d.bestStreak = Math.max(d.bestStreak, d.streak);
    } else {
      d.losses += 1;
      d.streak = 0;
    }
    this.state.rival.matches.push({ place: won ? 1 : 2, field: 2, mode: "duel", date, won });
    if (this.state.rival.matches.length > 8) this.state.rival.matches.splice(0, this.state.rival.matches.length - 8);
    this.persist();
    return { delta, streak: d.streak };
  }

  /** Marks today's daily challenge complete. @returns false if already done. */
  completeDaily(date: string): boolean {
    const c = this.state.challenges;
    if (c.dailyDate === date && c.dailyDone) return false;
    c.dailyDate = date;
    c.dailyDone = true;
    c.dailiesDone += 1;
    this.persist();
    return true;
  }

  isDailyDone(date: string): boolean {
    const c = this.state.challenges;
    return c.dailyDate === date && c.dailyDone;
  }

  /** Marks a gauntlet stage done. @returns "stage" | "clear" | null. */
  completeGauntletStage(week: string, index: number): "stage" | "clear" | null {
    const c = this.state.challenges;
    if (c.gauntletWeek !== week) {
      c.gauntletWeek = week;
      c.gauntletDone = [];
    }
    if (c.gauntletDone.includes(index)) return null;
    c.gauntletDone.push(index);
    const cleared = c.gauntletDone.length >= 3;
    if (cleared) c.gauntletsCleared += 1;
    this.persist();
    return cleared ? "clear" : "stage";
  }

  gauntletDone(week: string): number[] {
    const c = this.state.challenges;
    return c.gauntletWeek === week ? [...c.gauntletDone] : [];
  }

  /** Claims today's login-calendar day. @returns the new cycle day, or 0. */
  claimCalendar(today: string): number {
    const c = this.state.calendar;
    if (c.lastClaim === today) return 0;
    c.lastClaim = today;
    c.cycleDay = (c.cycleDay % 28) + 1;
    this.persist();
    return c.cycleDay;
  }

  /** Records a weekly-event clear. @returns clears this week / this month. */
  recordEventClear(week: string, month: string): { week: number; month: number } {
    const e = this.state.events;
    if (e.week !== week) {
      e.week = week;
      e.clearsThisWeek = 0;
    }
    if (e.month !== month) {
      e.month = month;
      e.clearsThisMonth = 0;
    }
    e.clearsThisWeek += 1;
    e.clearsThisMonth += 1;
    this.persist();
    return { week: e.clearsThisWeek, month: e.clearsThisMonth };
  }

  /** Marks the monthly theme trail as claimed for `month`. @returns false if already claimed. */
  claimThemeTrail(month: string): boolean {
    if (this.state.events.claimedTrailMonth === month) return false;
    this.state.events.claimedTrailMonth = month;
    this.persist();
    return true;
  }

  /** Claims a campaign chapter reward. @returns false if already claimed. */
  claimCampaign(chapterId: string): boolean {
    if (this.state.campaignClaimed.includes(chapterId)) return false;
    this.state.campaignClaimed.push(chapterId);
    this.persist();
    return true;
  }

  /** Counts a run toward per-mode mastery. @returns the new run count. */
  addMasteryRun(modeId: string): number {
    const n = (this.state.mastery[modeId] ?? 0) + 1;
    this.state.mastery[modeId] = n;
    this.persist();
    return n;
  }

  ownTrail(id: string): boolean {
    if (this.state.tournaments.trails.includes(id)) return false;
    this.state.tournaments.trails.push(id);
    this.persist();
    return true;
  }

  equipTrail(id: string): void {
    this.state.activeTrail = this.state.tournaments.trails.includes(id) ? id : "";
    this.persist();
  }

  markBiomeSeen(id: string): boolean {
    if (this.state.biomesSeen.includes(id)) return false;
    this.state.biomesSeen.push(id);
    this.persist();
    return true;
  }

  addGhostBeat(): void {
    this.state.lifetime.ghostBeats += 1;
    this.persist();
  }

  completeMission(id: string): boolean {
    if (this.state.completedMissions.includes(id)) return false;
    this.state.completedMissions.push(id);
    this.state.nestLevel = this.state.completedMissions.length;
    this.persist();
    return true;
  }

  unlockAchievement(id: string): boolean {
    if (this.state.achievements.includes(id)) return false;
    this.state.achievements.push(id);
    this.persist();
    return true;
  }

  nestMultiplier(): number {
    return 1 + this.state.nestLevel * NEST_MULT_PER_LEVEL;
  }

  spend(amount: number): boolean {
    if (this.state.wallet < amount) return false;
    this.state.wallet -= amount;
    this.persist();
    return true;
  }

  addCoins(amount: number): void {
    this.state.wallet += amount;
    this.state.totalCoins += amount;
    this.persist();
  }

  ownSkin(id: string): void {
    if (!this.state.ownedSkins.includes(id)) this.state.ownedSkins.push(id);
    this.persist();
  }

  equipSkin(id: string): void {
    if (!this.state.ownedSkins.includes(id)) return;
    this.state.activeSkin = id;
    this.persist();
  }

  armBoost(id: string): void {
    if (!this.state.armedBoosts.includes(id)) this.state.armedBoosts.push(id);
    this.persist();
  }

  consumeArmedBoosts(): string[] {
    const list = [...this.state.armedBoosts];
    this.state.armedBoosts = [];
    this.persist();
    return list;
  }

  setGold(v: boolean): void {
    this.state.gold = v;
    this.persist();
  }

  /** VIP is a real monthly subscription: it accrues from now (or extends) and expires. */
  grantVip(days = VIP_DAYS): void {
    const base = this.isVipActive() && this.state.vipUntil > Date.now() ? this.state.vipUntil : Date.now();
    this.state.vip = true;
    this.state.vipUntil = base + days * 86_400_000;
    this.persist();
  }

  setVip(v: boolean): void {
    this.state.vip = v;
    this.state.vipUntil = v ? Date.now() + VIP_DAYS * 86_400_000 : 0;
    this.persist();
  }

  isVipActive(): boolean {
    if (!this.state.vip) return false;
    if (this.state.vipUntil && Date.now() > this.state.vipUntil) {
      this.state.vip = false;
      this.persist();
      return false;
    }
    return true;
  }

  vipDaysLeft(): number {
    if (!this.isVipActive() || !this.state.vipUntil) return 0;
    return Math.max(0, Math.ceil((this.state.vipUntil - Date.now()) / 86_400_000));
  }

  claimVipDaily(today: string): number {
    if (!this.isVipActive() || this.state.vipLastClaim === today) return 0;
    this.state.vipLastClaim = today;
    this.addCoins(VIP_DAILY_GIFT);
    return VIP_DAILY_GIFT;
  }

  /* ---------- advertising frequency caps (enforced, not decorative) ---------- */

  adsLeftToday(cap = ADS_PER_DAY): number {
    const day = dateSeed();
    if (this.state.ads.day !== day) return cap;
    return Math.max(0, cap - this.state.ads.count);
  }

  shouldShowInterstitial(runsPlayed: number, every = INTERSTITIAL_EVERY, cap = ADS_PER_DAY): boolean {
    if (runsPlayed < 2) return false;
    if ((runsPlayed - 2) % every !== 0) return false;
    if (runsPlayed - this.state.ads.lastRun < AD_MIN_RUN_GAP) return false;
    return this.adsLeftToday(cap) > 0;
  }

  recordAdImpression(runsPlayed: number): void {
    const day = dateSeed();
    const a = this.state.ads;
    if (a.day !== day) {
      a.day = day;
      a.count = 0;
    }
    a.count += 1;
    a.lastRun = runsPlayed;
    this.persist();
  }

  redeem(code: string): boolean {
    if (this.state.redeemedCodes.includes(code)) return false;
    this.state.redeemedCodes.push(code);
    this.persist();
    return true;
  }

  redeemReferral(code: string): boolean {
    const clean = code.trim().toUpperCase();
    if (!clean || clean === this.state.referralCode || this.state.referralRedeemed) return false;
    if (!/^SUN-[A-Z0-9]{6}$/.test(clean)) return false;
    this.state.referralRedeemed = true;
    this.persist();
    return true;
  }

  touchStreak(today: string, yesterday: string): number {
    const s = this.state.streak;
    if (s.claimedDate === today) return 0;
    // Check for comeback BEFORE overwriting s.last
    const isComeback = s.last !== yesterday && s.last !== today && s.days > 0;
    if (s.last === yesterday) s.days += 1;
    else if (s.last !== today) s.days = 1;
    s.last = today;
    s.claimedDate = today;
    const reward = 20 * Math.min(7, Math.max(1, s.days));
    this.state.wallet += reward;
    this.state.totalCoins += reward;
    // Comeback bonus: only when returning after missing days (not day 1)
    if (isComeback) {
      const comebackBonus = 50;
      this.state.wallet += comebackBonus;
      this.state.totalCoins += comebackBonus;
    }
    this.persist();
    return reward;
  }

  questsClaimed(date: string): string[] {
    return this.state.quests.date === date ? this.state.quests.claimed : [];
  }

  claimQuest(date: string, id: string): void {
    if (this.state.quests.date !== date) this.state.quests = { date, claimed: [] };
    if (!this.state.quests.claimed.includes(id)) this.state.quests.claimed.push(id);
    this.persist();
  }

  exportCode(): string {
    try {
      return btoa(unescape(encodeURIComponent(JSON.stringify(this.state))));
    } catch {
      return "";
    }
  }

  importCode(code: string): boolean {
    try {
      const json = decodeURIComponent(escape(atob(code.trim())));
      const parsed = JSON.parse(json) as Partial<SaveState>;
      if (typeof parsed !== "object" || parsed === null || !("deviceId" in parsed)) return false;
      localStorage.setItem(SAVE_KEY, JSON.stringify(parsed));
      this.state = this.load();
      return true;
    } catch {
      return false;
    }
  }

  resetProgress(): void {
    this.state = defaults();
    this.persist();
  }
}
