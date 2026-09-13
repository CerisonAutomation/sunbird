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
import { seasonId } from "./constants";

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
  voiceEnabled: boolean;
  tts: boolean;
  lang: string;
};

export type LifetimeStats = {
  distance: number;
  coins: number;
  zeniths: number;
  ghostBeats: number;
  perfects: number;
  playTime: number;
  bestCombo: number;
  biomeVisits: Record<string, number>;
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
  playerName: string;
};

const DEFAULT_SETTINGS: Settings = {
  mute: false,
  music: true,
  musicVolume: 0.8,
  sfxVolume: 0.9,
  haptics: true,
  reduceMotion: false,
  quality: "auto",
  voiceEnabled: false,
  tts: false,
  lang: "",
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
    lifetime: { distance: 0, coins: 0, zeniths: 0, ghostBeats: 0, perfects: 0, playTime: 0, bestCombo: 0, biomeVisits: {} },
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
    playerName: "",
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
          musicVolume: p.settings?.musicVolume !== undefined ? Number(p.settings.musicVolume) : 0.8,
          sfxVolume: p.settings?.sfxVolume !== undefined ? Number(p.settings.sfxVolume) : 0.9,
          haptics: p.settings?.haptics === undefined ? true : Boolean(p.settings.haptics),
          reduceMotion: Boolean(p.settings?.reduceMotion),
          quality: quality === "high" || quality === "low" ? quality : "auto",
          voiceEnabled: Boolean(p.settings?.voiceEnabled),
          tts: Boolean(p.settings?.tts),
          lang: typeof p.settings?.lang === "string" ? p.settings.lang : "",
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
          perfects: num(p.lifetime?.perfects),
          playTime: num(p.lifetime?.playTime),
          bestCombo: num(p.lifetime?.bestCombo),
          biomeVisits: p.lifetime?.biomeVisits && typeof p.lifetime.biomeVisits === "object"
            ? Object.fromEntries(Object.entries(p.lifetime.biomeVisits as Record<string, unknown>).map(([k, v]) => [k, num(v)]))
            : {},
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
        playerName: typeof p.playerName === "string" ? p.playerName : "",
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

  addLifetimePerfects(n: number): void {
    this.state.lifetime.perfects += n;
    this.persist();
  }

  addLifetimePlayTime(seconds: number): void {
    this.state.lifetime.playTime += seconds;
  }

  noteLifetimeBestCombo(combo: number): void {
    if (combo > this.state.lifetime.bestCombo) {
      this.state.lifetime.bestCombo = combo;
      this.persist();
    }
  }

  trackBiomeVisit(biomeId: string): void {
    if (!biomeId) return;
    const bv = this.state.lifetime.biomeVisits;
    bv[biomeId] = (bv[biomeId] ?? 0) + 1;
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
    if (s.last === yesterday) s.days += 1;
    else if (s.last !== today) s.days = 1;
    s.last = today;
    s.claimedDate = today;
    const reward = 20 * Math.min(7, Math.max(1, s.days));
    this.state.wallet += reward;
    this.state.totalCoins += reward;
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
      const parsed = JSON.parse(json) as Record<string, unknown>;
      if (typeof parsed !== "object" || parsed === null || !("deviceId" in parsed)) return false;

      /* ---------- field-level validation (XSS defense) ---------- */

      // referralCode: must match strict SUN-XXXXXX pattern
      const CODE_RE = /^SUN-[A-Z0-9]{6}$/;
      if (typeof parsed.referralCode === "string" && !CODE_RE.test(parsed.referralCode)) {
        parsed.referralCode = "";
      } else if (typeof parsed.referralCode !== "string") {
        parsed.referralCode = "";
      }

      // String fields: reject anything that is not a string
      for (const k of [
        "deviceId", "vipLastClaim", "activeSkin", "referralCode",
        "referralMessage", "cloudMessage", "cloudCode",
      ]) {
        if (typeof parsed[k] !== "string") parsed[k] = "";
      }

      // Numeric fields: coerce and filter non-finite
      for (const k of [
        "bestScore", "bestDistance", "totalCoins", "wallet", "nestLevel",
        "vipUntil", "runsPlayed", "farthestIsland", "tutorialRuns",
        "skill", "skillSamples", "bestAltitude", "bestCombo",
      ]) {
        parsed[k] = num(parsed[k]);
      }

      // Boolean fields
      for (const k of ["gold", "vip", "referralRedeemed"]) {
        parsed[k] = Boolean(parsed[k]);
      }

      // String arrays
      for (const k of [
        "completedMissions", "ownedSkins", "armedBoosts",
        "redeemedCodes", "achievements", "biomesSeen",
      ]) {
        parsed[k] = strArr(parsed[k]);
      }

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
