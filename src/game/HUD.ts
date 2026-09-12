import type { AchievementView } from "./Achievements";
import type { ActivePower } from "./PowerUps";
import type { SessionGoal } from "./Engagement";
import type { ModeDef } from "./Modes";
import type { RacerStats } from "./Racer";
import type { BoardMetric, BoardPage, BoardScope } from "./Leaderboard";
import type { TournamentView } from "./Tournaments";
import type { RosterBird, Standing } from "./MassRace";
import { VIP_DAILY_GIFT } from "./constants";
import { COLLECTIONS, type BoostView, type ShopTrailView, type SkinView } from "./Economy";
import { MenuSky } from "./MenuSky";
import { formatDistance } from "./math";
import type { MissionView, QuestReward, QuestView } from "./Missions";
import type { CampaignChapterView } from "./Campaign";
import type { MonthlyTheme, WeeklyEvent } from "./Events";
import type { SquadState } from "./Squad";
import type { HighScore, Settings } from "./SaveData";
import type { TierView } from "./SeasonPass";

export type UiScreen =
  | "main"
  | "shop"
  | "paywall"
  | "checkout"
  | "settings"
  | "scores"
  | "pass"
  | "trophies"
  | "account"
  | "atlas"
  | "modes"
  | "board"
  | "cups"
  | "live"
  | "rank"
  | "challenges"
  | "campaign"
  | "squad";

export type RivalCard = {
  rating: number;
  division: string;
  divisionIcon: string;
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
  nextName: string;
  nextNeeded: number;
  progress: number;
  matches: { place: number; field: number; mode: string; date: string; won: boolean }[];
  season: { daysLeft: number; peak: number; peakDivision: string; peakIcon: string; rewardCoins: number };
};

export type LoadoutView = {
  bird: string;
  trail: string;
  boosts: number;
};

export type AtlasEntry = {
  island: number;
  name: string;
  emoji: string;
  tagline: string;
  color: string;
  reached: boolean;
  hazard: string;
};
export type UiState = "menu" | "playing" | "paused" | "continue" | "ad" | "gameover";
export type SeedMode = "today" | "yesterday" | "random";
export type CheckoutMode = "stripe" | "demo";
export type PortalName = "none" | "poki" | "crazy" | "generic";

export type HudSnapshot = {
  state: UiState;
  screen: UiScreen;
  checkoutSku: "sunbird_gold" | "sunbird_vip" | "sunbird_starter";
  portalName: PortalName;
  version: number;
  distance: number;
  coins: number;
  daylight: number;
  daylightMax: number;
  fever: number;
  feverOn: boolean;
  multiplier: number;
  bestDistance: number;
  score: number;
  island: number;
  perfects: number;
  clouds: number;
  zeniths: number;
  rings: number;
  balloons: number;
  hint: string;
  magnetTimer: number;
  shield: number;
  boostTimer: number;
  gold: boolean;
  vip: boolean;
  vipDaysLeft: number;
  vipExpiredNotice: boolean;
  adsLeftToday: number;
  ghostDelta: number | null;
  continueTimer: number;
  continueCost: number;
  canAffordContinue: boolean;
  adAvailable: boolean;
  adTimer: number;
  adTotal: number;
  adReason: "continue" | "interstitial";
  seedLabel: string;
  /** Active incoming rival challenge: "name|distance", or "" when none. */
  rivalBanner: string;
  seedMode: SeedMode;
  wallet: number;
  streakDays: number;
  nestLevel: number;
  nestPrice: number;
  nestMaxed: boolean;
  nestMult: number;
  missions: MissionView[];
  quests: QuestView[];
  highScores: HighScore[];
  todayBest: number;
  runsPlayed: number;
  newlyCompleted: string[];
  claimedQuests: QuestReward[];
  skins: SkinView[];
  boosts: BoostView[];
  shopTrails: ShopTrailView[];
  settings: Settings;
  goldPrice: string;
  starterPrice: string;
  starterFeatures: string[];
  starterOwned: boolean;
  goldFeatures: string[];
  vipPrice: string;
  vipFeatures: string[];
  checkoutMode: CheckoutMode;
  checkoutUrl: string;
  checkoutBusy: boolean;
  checkoutError: string;
  checkoutOk: boolean;
  checkoutWaiting: boolean;
  restoreMessage: string;
  resetArmed: boolean;
  season: { tier: number; maxTier: number; have: number; need: number; label: string; tiers: TierView[] };
  trophies: AchievementView[];
  trophyCounts: { unlocked: number; total: number };
  referralCode: string;
  referralRedeemed: boolean;
  referralMessage: string;
  cloudCode: string;
  cloudMessage: string;
  canInstall: boolean;
  shareBusy: boolean;
  combo: number;
  speedNorm: number;
  gust: number;
  inThermal: boolean;
  biomeName: string;
  biomeEmoji: string;
  atlas: AtlasEntry[];
  farthestIsland: number;
  showTutorialHand: boolean;
  /* --- momentum / flight readouts --- */
  launchBanner: string;
  launchBannerT: number;
  launchRating: string;
  altitude: number;
  altZone: number;
  maxAltitude: number;
  powers: ActivePower[];
  modes: ModeDef[];
  modeId: string;
  modeName: string;
  modeIcon: string;
  countdown: number;
  versus: boolean;
  versusWinner: number;
  p1Stats: RacerStats | null;
  p2Stats: RacerStats | null;
  raceFinish: number;
  /* --- engagement --- */
  sessionGoals: SessionGoal[];
  goalPop: string;
  nearMiss: string;
  skillLabel: string;
  skill: number;
  bestAltitude: number;
  bestCombo: number;
  runGems: number;
  /* --- competitive --- */
  pilotName: string;
  board: BoardPage | null;
  boardLoading: boolean;
  boardScope: BoardScope;
  boardMetric: BoardMetric;
  boardOnline: boolean;
  cups: TournamentView[];
  trails: { id: string; label: string; equipped: boolean }[];
  lastPrize: string;
  standings: Standing[];
  racePlace: number;
  /** Finish line in metres for the live race progress strip (0 = endless). */
  raceFinishM: number;
  raceField: number;
  raceFinishTime: number;
  massRace: boolean;
  multiplayerLive: boolean;
  /* --- live room + roster --- */
  roster: RosterBird[];
  roomCode: string;
  roomCount: number;
  roomCapacity: number;
  roomSize: number;
  roomSkill: string;
  roomMuted: boolean;
  roomRivals: { id: string; name: string; skill: number; hue: number }[];
  netState: string;
  netError: string;
  draft: number;
  finishRemaining: number;
  nemesis: string;
  photoFinish: string;
  rival: RivalCard;
  loadout: LoadoutView;
  lobbyRivals: { name: string; tag: string }[];
  raceRated: boolean;
  /** True when the room server (single-threaded referee) confirmed the place. */
  raceVerified: boolean;
  ratingDelta: number;
  ratingBonus: number;
  /* --- duels --- */
  duel: { wins: number; losses: number; streak: number; bestStreak: number };
  duelWas: "" | "won" | "lost";
  duelDelta: number;
  duelFoe: { name: string; tag: string; rating: number };
  /* --- daily challenge / weekly gauntlet / calendar / mastery --- */
  daily: DailyCard;
  gauntlet: GauntletCard;
  calendar: CalendarCard;
  mastery: MasteryRow[];
  challengeOutcome: string;
  /* --- live-ops events + campaign + squad --- */
  weeklyEvent: WeeklyEvent;
  monthlyTheme: MonthlyTheme;
  eventClearsWeek: number;
  eventClearsMonth: number;
  themeTrailClaimed: boolean;
  themeTrailNeed: number;
  campaign: CampaignChapterView[];
  campaignDone: number;
  campaignTotal: number;
  squad: SquadState;
  squadNotice: string;
};

export type DailyCard = {
  title: string;
  modeName: string;
  modeIcon: string;
  modifierIcon: string;
  modifierLabel: string;
  modifierDesc: string;
  metric: string;
  target: number;
  reward: number;
  done: boolean;
  dailiesDone: number;
};

export type GauntletCard = {
  week: string;
  stages: { index: number; label: string; modeName: string; modeIcon: string; metric: string; target: number; reward: number; done: boolean }[];
  clearBonus: number;
  cleared: boolean;
  lifetimeClears: number;
};

export type CalendarCard = {
  cycleDay: number;
  claimedToday: boolean;
  days: { day: number; label: string; claimed: boolean; today: boolean; milestone: boolean }[];
};

export type MasteryRow = {
  modeId: string;
  name: string;
  icon: string;
  runs: number;
  level: number;
  nextAt: number | null;
  progress: number;
  /** Active perk line ("+4% coins" or the signature skill when maxed). */
  perk: string;
  /** Signature level-5 skill this mode builds toward. */
  skillName: string;
  skillDesc: string;
  maxed: boolean;
};

type ActionHandler = (action: string, id: string) => void;

export class HUD {
  readonly root: HTMLDivElement;
  private playHud!: HTMLElement;
  private distanceEl!: HTMLElement;
  private coinsEl!: HTMLElement;
  private bestEl!: HTMLElement;
  private islandEl!: HTMLElement;
  private multEl!: HTMLElement;
  private goldChip!: HTMLElement;
  private vipChip!: HTMLElement;
  private ghostChip!: HTMLElement;
  private powersEl!: HTMLElement;
  private sunFill!: HTMLElement;
  private sunKnob!: HTMLElement;
  private feverWrap!: HTMLElement;
  private feverFill!: HTMLElement;
  private hintEl!: HTMLElement;
  private menuEl!: HTMLElement;
  private readonly menuSky = new MenuSky();
  private menuCard!: HTMLElement;
  private pauseEl!: HTMLElement;
  private contEl!: HTMLElement;
  private contCard!: HTMLElement;
  private adEl!: HTMLElement;
  private adCard!: HTMLElement;
  private overEl!: HTMLElement;
  private overCard!: HTMLElement;
  private toastLayer!: HTMLElement;
  private flashEl!: HTMLElement;
  private comboEl!: HTMLElement;
  private biomeChip!: HTMLElement;
  private speedLines!: HTMLElement;
  private handEl!: HTMLElement;
  private altGauge!: HTMLElement;
  private altFill!: HTMLElement;
  private altBird!: HTMLElement;
  private altRead!: HTMLElement;
  private launchBanner!: HTMLElement;
  private powerStrip!: HTMLElement;
  private countdownEl!: HTMLElement;
  private versusBar!: HTMLElement;
  private goalStrip!: HTMLElement;
  private goalPop!: HTMLElement;
  private standingsEl!: HTMLElement;
  private rosterBar!: HTMLElement;
  private matchmakingEl!: HTMLElement;
  private matchmakingCount!: HTMLElement;
  private matchmakingLabel!: HTMLElement;
  private draftMeter!: HTMLElement;
  private finishCd!: HTMLElement;
  private lastFinishCd = "";
  private emoteWheel!: HTMLElement;
  private lastStandings = "";
  private lastRoster = "";
  private lastRosterAt = 0;
  private lastStandingsAt = 0;
  private lastVersusKey = "";
  private lastGoals = "";
  private lastGoalPop = "";
  private lastPowers = "";
  private lastBanner = "";
  private lastCountdown = "";
  private lastCombo = -1;
  private lastBiome = "";
  /** Per-frame text write memoization: DOM writes only when content changes. */
  private readonly textCache = new Map<string, string>();
  private readonly styleCache = new Map<string, string>();

  private setText(el: HTMLElement, key: string, value: string): void {
    if (this.textCache.get(key) === value) return;
    this.textCache.set(key, value);
    el.textContent = value;
  }

  private setStyle(el: HTMLElement, key: string, prop: "width" | "height" | "opacity" | "left" | "bottom", value: string): void {
    const ck = `${key}:${prop}`;
    if (this.styleCache.get(ck) === value) return;
    this.styleCache.set(ck, value);
    el.style[prop] = value;
  }

  /** Flush caches when a full re-render happens so we don't skip first writes. */
  private flushCaches(): void {
    this.textCache.clear();
    this.styleCache.clear();
  }
  private contTimerEl: HTMLElement | null = null;
  private adBarEl: HTMLElement | null = null;
  private adSkipEl: HTMLButtonElement | null = null;
  private lastKey = "";
  private lastHint = "";
  private lastChips = "";

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "hud-root";
    this.root.innerHTML = `
      <div class="play-hud hidden" data-ref="playHud">
        <div class="top-bar">
          <div class="stat-block">
            <div class="stat-label">Distance</div>
            <div class="stat-value" data-ref="distance">0 m</div>
            <div class="stat-sub">best <span data-ref="best">0</span></div>
          </div>
          <div class="sun-meter" title="Daylight">
            <div class="sun-track">
              <div class="sun-fill" data-ref="sunFill"></div>
              <div class="sun-knob" data-ref="sunKnob">☀</div>
            </div>
            <div class="sun-caption">daylight</div>
          </div>
          <div class="stat-block right">
            <div class="stat-label">Coins</div>
            <div class="stat-value coin" data-ref="coins">0</div>
          </div>
        </div>
        <div class="speedlines" data-ref="speedlines"></div>
        <div class="alt-gauge" data-ref="altGauge">
          <div class="alt-track">
            <span class="alt-zone z4"></span><span class="alt-zone z3"></span>
            <span class="alt-zone z2"></span><span class="alt-zone z1"></span>
            <i class="alt-fill" data-ref="altFill"></i>
            <b class="alt-bird" data-ref="altBird">🐦</b>
          </div>
          <div class="alt-read" data-ref="altRead">0 m</div>
        </div>
        <div class="launch-banner" data-ref="launchBanner"></div>
        <div class="power-strip" data-ref="powerStrip"></div>
        <div class="goal-strip" data-ref="goalStrip"></div>
        <div class="goal-pop" data-ref="goalPop"></div>
        <div class="countdown" data-ref="countdown"></div>
        <div class="versus-bar hidden" data-ref="versusBar"></div>
        <div class="standings hidden" data-ref="standings"></div>
        <div class="roster-bar hidden" data-ref="rosterBar"></div>
        <div class="draft-meter hidden" data-ref="draftMeter"><i></i><span>SLIPSTREAM</span></div>
        <div class="finish-countdown hidden" data-ref="finishCd"></div>
        <div class="emote-wheel hidden" data-ref="emoteWheel">
          <button data-ui data-action="emote" data-id="👋">👋</button>
          <button data-ui data-action="emote" data-id="🔥">🔥</button>
          <button data-ui data-action="emote" data-id="😂">😂</button>
          <button data-ui data-action="emote" data-id="👋">👋</button>
          <button data-ui data-action="emote" data-id="😱">😱</button>
          <button data-ui data-action="emote" data-id="👑">👑</button>
          <button data-ui data-action="emote" data-id="💨">💨</button>
          <button data-ui data-action="emote" data-id="🤝">🤝</button>
        </div>
        <div class="mid-meta">
          <div class="island-chip" data-ref="island">Island 1</div>
          <div class="biome-chip" data-ref="biome"></div>
          <div class="mult-chip" data-ref="mult">×1.0</div>
          <div class="gold-chip hidden" data-ref="goldChip">✦ GOLD</div>
          <div class="vip-chip hidden" data-ref="vipChip">♛ VIP</div>
          <div class="ghost-chip hidden" data-ref="ghostChip"></div>
        </div>
        <div class="power-chips" data-ref="powers"></div>
        <div class="fever-wrap" data-ref="feverWrap">
          <div class="fever-label">FEVER</div>
          <div class="fever-bar"><div class="fever-fill" data-ref="feverFill"></div></div>
        </div>
        <button class="icon-btn pause-btn" data-ui data-action="pause" aria-label="Pause">❙❙</button>
        <div class="combo" data-ref="combo"></div>
        <div class="hint" data-ref="hint"></div>
        <div class="hand" data-ref="hand">☝</div>
      </div>

      <div class="overlay menu hidden" data-ref="menu"><div class="paper-card" data-ref="menuCard"></div></div>

      <div class="overlay pause hidden" data-ref="pause">
        <div class="paper-card slim">
          <h2>Paused</h2>
          <p class="tagline">The sun waits for no bird.</p>
          <button class="primary-btn" data-ui data-action="resume">Resume</button>
          <button class="ghost-btn" data-ui data-action="menu">Give up</button>
        </div>
      </div>

      <div class="overlay continue hidden" data-ref="continue"><div class="paper-card slim" data-ref="contCard"></div></div>
      <div class="overlay ad hidden" data-ref="ad"><div class="ad-card" data-ref="adCard"></div></div>
      <div class="overlay gameover hidden" data-ref="over"><div class="paper-card" data-ref="overCard"></div></div>

      <div class="toasts" data-ref="toasts"></div>
      <div class="flash" data-ref="flash"></div>
      <div class="victory-banner hidden" data-ref="victoryBanner"><div class="victory-text" data-ref="victoryText"></div></div>
      <div class="matchmaking hidden" data-ref="matchmaking"><div class="matchmaking-spinner"></div><div class="matchmaking-count" data-ref="matchmakingCount">0 pilots</div><div class="matchmaking-label" data-ref="matchmakingLabel">Searching for live pilots…</div><button class="soft-btn mm-cancel" data-ui data-action="mm-cancel">Cancel</button></div>
      <div class="vs-screen hidden" data-ref="vsScreen"><div class="vs-title">VS</div><div class="vs-players"><div class="vs-player"><div class="vs-player-name" data-ref="vsP1">You</div></div><div class="vs-player"><div class="vs-player-name" data-ref="vsP2">Rival</div></div></div></div>
    `;
    parent.appendChild(this.root);
    this.bind();
  }

  /** Matchmaking overlay: live pilot count + honest countdown to backfill. */
  setMatchmaking(on: boolean, live: number, _field: number, secsLeft: number): void {
    this.matchmakingEl.classList.toggle("hidden", !on);
    if (!on) return;
    this.matchmakingCount.textContent = `${live} live pilot${live === 1 ? "" : "s"}`;
    this.matchmakingLabel.textContent =
      secsLeft > 0.5
        ? `Searching… player ghosts fill the field in ${Math.ceil(secsLeft)}s`
        : "Launching…";
  }

  onAction(handler: ActionHandler): void {
    this.root.addEventListener("click", (e) => {
      const t = (e.target as HTMLElement).closest("[data-action]") as HTMLElement | null;
      if (!t || (t as HTMLButtonElement).disabled) return;
      e.preventDefault();
      e.stopPropagation();
      handler(t.dataset.action ?? "", t.dataset.id ?? "");
    });
  }

  readValue(ref: string): string {
    const el = this.root.querySelector(`[data-ref="${CSS.escape(ref)}"]`) as HTMLInputElement | HTMLTextAreaElement | null;
    return el?.value ?? "";
  }

  update(s: HudSnapshot): void {
    const key = `${s.state}|${s.screen}|${s.version}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.flushCaches();
      this.renderStatic(s);
    }

    const inPlay = s.state === "playing" || s.state === "paused" || s.state === "continue";
    this.playHud.classList.toggle("hidden", !inPlay);
    this.playHud.classList.toggle("versus", s.versus);
    const menuVisible = s.state === "menu" || (s.state === "gameover" && s.screen !== "main");
    this.menuEl.classList.toggle("hidden", !menuVisible);
    if (menuVisible) this.menuSky.resize(this.menuEl.clientWidth, this.menuEl.clientHeight);
    this.menuSky.setActive(menuVisible);
    // The hero bird only plays on the title screen — flying over the shop or
    // pass card reads as a glitch, not charm.
    this.menuSky.heroHost.classList.toggle("hidden", !(menuVisible && s.screen === "main"));
    this.pauseEl.classList.toggle("hidden", s.state !== "paused");
    this.contEl.classList.toggle("hidden", s.state !== "continue");
    this.adEl.classList.toggle("hidden", s.state !== "ad");
    this.overEl.classList.toggle("hidden", !(s.state === "gameover" && s.screen === "main"));

    if (inPlay) {
      this.setText(this.distanceEl, "dist", formatDistance(s.distance));
      this.setText(this.coinsEl, "coins", String(s.coins));
      this.setText(this.bestEl, "best", formatDistance(s.bestDistance));
      this.setText(this.islandEl, "island", `Island ${s.island + 1}`);
      this.setText(this.multEl, "mult", `×${s.multiplier.toFixed(1)}`);
      this.goldChip.classList.toggle("hidden", !s.gold);
      this.vipChip.classList.toggle("hidden", !s.vip);
      if (this.vipChip.textContent !== `♛ VIP · ${s.vipDaysLeft}d`) this.vipChip.textContent = `♛ VIP · ${s.vipDaysLeft}d`;
      if (s.ghostDelta === null) {
        this.ghostChip.classList.add("hidden");
      } else {
        this.ghostChip.classList.remove("hidden");
        const ahead = s.ghostDelta >= 0;
        this.ghostChip.textContent = `👻 ${ahead ? "+" : ""}${Math.round(s.ghostDelta)}m`;
        this.ghostChip.classList.toggle("ahead", ahead);
        this.ghostChip.classList.toggle("behind", !ahead);
      }

      const day = Math.min(1, s.daylight / s.daylightMax);
      this.setStyle(this.sunFill, "sunFill", "width", `${Math.max(2, day * 100)}%`);
      this.setStyle(this.sunKnob, "sunKnob", "left", `${day * 100}%`);
      this.sunFill.classList.toggle("low", day < 0.28);

      this.feverWrap.classList.toggle("on", s.feverOn);
      this.setStyle(this.feverFill, "feverFill", "width", `${Math.max(0, Math.min(1, s.fever)) * 100}%`);

      const chips: string[] = [];
      if (s.boostTimer > 0) chips.push(`<span class="pchip boost">🚀 boost</span>`);
      if (s.magnetTimer > 0) chips.push(`<span class="pchip magnet">🧲 ${Math.ceil(s.magnetTimer)}s</span>`);
      if (s.shield > 0) chips.push(`<span class="pchip shield">🛡 ×${s.shield}</span>`);
      if (s.gust > 0.3) chips.push(`<span class="pchip gust">🌬 headwind — dive!</span>`);
      if (s.inThermal) chips.push(`<span class="pchip thermal">♨ thermal — release!</span>`);
      const html = chips.join("");

      if (s.combo !== this.lastCombo) {
        this.lastCombo = s.combo;
        this.comboEl.textContent = s.combo >= 2 ? `×${s.combo} chain` : "";
        this.comboEl.classList.toggle("show", s.combo >= 2);
        if (s.combo >= 2) {
          this.comboEl.classList.remove("pop");
          void this.comboEl.offsetWidth;
          this.comboEl.classList.add("pop");
        }
      }
      const biomeTxt = `${s.biomeEmoji} ${s.biomeName}`;
      if (biomeTxt !== this.lastBiome) {
        this.lastBiome = biomeTxt;
        this.biomeChip.textContent = biomeTxt;
      }
      this.setStyle(this.speedLines, "speedlines", "opacity", String(Math.max(0, (s.speedNorm - 0.55) * 1.6)));

      // altitude gauge (log-ish so low hops still read, big launches still climb)
      const aN = Math.min(1, Math.pow(s.altitude / 340, 0.65));
      this.setStyle(this.altFill, "altFill", "height", `${aN * 100}%`);
      this.setStyle(this.altBird, "altBird", "bottom", `calc(${aN * 100}% - 9px)`);
      this.setText(this.altRead, "altRead", `${Math.round(s.altitude)} m`);
      this.altGauge.dataset.zone = String(s.altZone);

      const bannerKey = `${s.launchBanner}|${s.launchBannerT > 0}`;
      if (bannerKey !== this.lastBanner) {
        this.lastBanner = bannerKey;
        this.launchBanner.textContent = s.launchBanner;
        this.launchBanner.className = `launch-banner ${s.launchRating} ${s.launchBannerT > 0 ? "show" : ""}`;
      }

      const pkey = s.powers.map((p) => `${p.kind}${Math.ceil(p.time)}`).join(",");
      if (pkey !== this.lastPowers) {
        this.lastPowers = pkey;
        this.powerStrip.innerHTML = s.powers
          .map(
            (p) =>
              `<span class="pu" title="${escapeHtml(p.label)}"><i>${escapeHtml(p.icon)}</i><b style="width:${Math.max(0, Math.min(1, p.time / p.total)) * 100}%"></b><u>${Math.ceil(p.time)}</u></span>`,
          )
          .join("");
      }

      const cd = s.countdown > 0 ? (s.countdown > 1 ? String(Math.ceil(s.countdown - 1)) : "FLY!") : "";
      if (cd !== this.lastCountdown) {
        this.lastCountdown = cd;
        this.countdownEl.textContent = cd;
        this.countdownEl.className = `countdown ${cd ? "show" : ""} ${cd === "FLY!" ? "go" : ""}`;
      }

      // Surface only the goal nearest completion — a single, always-open loop.
      let lead: SessionGoal | null = null;
      for (const g of s.sessionGoals) {
        if (g.done) continue;
        if (!lead || g.progress / g.target > lead.progress / lead.target) lead = g;
      }
      const gk = lead ? `${lead.id}:${Math.floor((lead.progress / lead.target) * 20)}` : "";
      if (gk !== this.lastGoals) {
        this.lastGoals = gk;
        if (lead) {
          const pct = Math.min(100, (lead.progress / lead.target) * 100);
          const close = pct >= 70;
          this.goalStrip.innerHTML = `<span class="gs ${close ? "close" : ""}"><em>${lead.label}</em><i><b style="width:${pct}%"></b></i></span>`;
        } else {
          this.goalStrip.innerHTML = "";
        }
      }
      if (s.goalPop !== this.lastGoalPop) {
        this.lastGoalPop = s.goalPop;
        this.goalPop.textContent = s.goalPop;
        this.goalPop.className = `goal-pop ${s.goalPop ? "show" : ""}`;
      }

      // Top-of-screen bird roster: every pilot as a live bird pip on the race
      // line, with your place badge and the gap to the leader. Rebuilds are
      // throttled to ~6 Hz and quantized so 41 pips don't churn the DOM.
      const showRoster = s.roster.length > 0;
      this.rosterBar.classList.toggle("hidden", !showRoster);
      if (showRoster) {
        const now = performance.now();
        const rkey = s.roster
          .map((r) => `${r.id}${Math.round(r.progress * 50)}${r.finished ? "F" : ""}${r.emote}`)
          .join("|");
        if (rkey !== this.lastRoster && now - this.lastRosterAt > 150) {
          this.lastRoster = rkey;
          this.lastRosterAt = now;
          const leader = s.roster[0];
          const you = s.roster.find((r) => r.you);
          const span = Math.max(1, s.raceFinish || 4000);
          const gapM =
            leader && you && !you.finished
              ? Math.max(0, Math.round((leader.progress - you.progress) * span))
              : 0;
          const placeTxt = you ? `P${you.place}` : "–";
          const gapTxt = !you || you.finished ? "FINISHED" : you.place === 1 ? "LEADER" : `-${gapM}m`;
          this.rosterBar.innerHTML =
            `<div class="roster-top"><span class="rp-place ${you && you.place <= 3 ? "podium" : ""}">${placeTxt}</span>` +
            `<span class="rm-lead">👑 ${escapeHtml(leader ? leader.name : "—")}</span>` +
            `<span class="rm-gap">${gapTxt}</span>` +
            `<span class="rm-count">${s.roster.length} birds</span>` +
            `${s.roomCode ? `<span class="rm-room">ROOM ${escapeHtml(s.roomCode)}</span>` : ""}` +
            `<span class="rm-net ${s.netState}">${s.multiplayerLive ? s.netState : "practice"}</span></div>` +
            `<div class="roster-track" role="img" aria-label="Live race positions">${s.roster
              .map(
                (r) =>
                  `<span class="rb ${r.you ? "you" : ""} ${r.remote ? "remote" : ""} ${r.ghost ? "ghost" : ""} ${r.finished ? "done" : ""}" ` +
                  `style="left:${(r.progress * 100).toFixed(1)}%;--h:${Math.round(r.hue * 360)}" ` +
                  `title="#${r.place} ${escapeHtml(r.name)}${r.remote ? " · live player" : r.ghost ? " · player ghost" : ""}">${r.emote ? `<b class="rb-emote">${escapeHtml(r.emote)}</b>` : ""}</span>`,
              )
              .join("")}</div>`;
        }
      }

      // Distance-to-finish readout, escalating as the gate approaches.
      const showCd = s.finishRemaining > 0 && s.finishRemaining < 900;
      this.finishCd.classList.toggle("hidden", !showCd);
      if (showCd) {
        const m = Math.ceil(s.finishRemaining);
        const txt = m > 0 ? `${m} m` : "";
        if (txt !== this.lastFinishCd) {
          this.lastFinishCd = txt;
          this.finishCd.textContent = txt;
        }
        this.finishCd.classList.toggle("close", s.finishRemaining < 250);
      }

      // Slipstream meter — only appears when you are actually drafting.
      const drafting = s.draft > 0.12;
      this.draftMeter.classList.toggle("hidden", !drafting);
      if (drafting) {
        const bar = this.draftMeter.firstElementChild as HTMLElement | null;
        if (bar) bar.style.width = `${Math.round(s.draft * 100)}%`;
      }
      this.emoteWheel.classList.toggle("hidden", !s.massRace);

      // Live standings ticker: leaders plus your row, with gaps to the car
      // ahead so every position fight reads at a glance. Throttled like the
      // roster so it never rebuilds mid-frame more than ~5×/s.
      this.standingsEl.classList.toggle("hidden", s.standings.length === 0);

      // The top-of-screen roster bar now carries everything the old position
      // badge + progress strip showed (place, gap to leader, full field line),
      // so those two were removed to stop the same place/gap reading twice.
      if (s.standings.length) {
        const nowS = performance.now();
        const key = s.standings.map((r) => `${r.id}${r.place}${Math.round(r.distance / 12)}${r.finished ? "F" : ""}`).join("|");
        if (key !== this.lastStandings && nowS - this.lastStandingsAt > 200) {
          this.lastStandings = key;
          this.lastStandingsAt = nowS;
          const top = s.standings[0];
          this.standingsEl.innerHTML =
            `<div class="st-head"><span>LIVE</span><span>${s.standings.length} shown</span></div>` +
            s.standings
              .map((r) => {
                const gap = top && r.place > top.place ? `-${Math.max(0, Math.round(top.distance - r.distance))}m` : r.finished ? "🏁" : "—";
                return `<div class="st-row ${r.you ? "you" : ""} ${r.kind === "remote" ? "remote" : ""} ${r.place <= 3 ? "p" + r.place : ""}">
                <span class="st-p">${r.place <= 3 ? ["🥇", "🥈", "🥉"][r.place - 1] : r.place}</span>
                <span class="st-n">${escapeHtml(r.name)}${r.kind === "remote" ? " ⇄" : ""}</span>
                <span class="st-d">${r.you || r.place <= 3 ? `${Math.round(r.distance)}m` : gap}</span>
              </div>`;
              })
              .join("");
        }
      }

      // Local 2P race bar: memoized so it writes only when rounded progress moves.
      this.versusBar.classList.toggle("hidden", !s.versus);
      if (s.versus && s.p1Stats && s.p2Stats) {
        const pct = (d: number): number => Math.min(100, (d / s.raceFinish) * 100);
        const vkey = `${Math.round(pct(s.p1Stats.distance))}|${Math.round(pct(s.p2Stats.distance))}`;
        if (vkey !== this.lastVersusKey) {
          this.lastVersusKey = vkey;
          const lead1 = s.p1Stats.distance >= s.p2Stats.distance;
          this.versusBar.innerHTML =
            `<div class="vs-row p1 ${lead1 ? "lead" : ""}"><span>P1${lead1 ? " 👑" : ""}</span><i><b style="width:${pct(s.p1Stats.distance)}%"></b></i><em>${Math.round(s.p1Stats.distance)}m</em></div>` +
            `<div class="vs-row p2 ${lead1 ? "" : "lead"}"><span>P2${lead1 ? "" : " 👑"}</span><i><b style="width:${pct(s.p2Stats.distance)}%"></b></i><em>${Math.round(s.p2Stats.distance)}m</em></div>`;
        }
      }
      this.handEl.classList.toggle("show", s.showTutorialHand);
      if (html !== this.lastChips) {
        this.lastChips = html;
        this.powersEl.innerHTML = html;
      }

      if (s.hint !== this.lastHint) {
        this.lastHint = s.hint;
        this.hintEl.textContent = s.hint;
        this.hintEl.classList.toggle("show", Boolean(s.hint));
      }
    }

    if (s.state === "continue" && this.contTimerEl) {
      const txt = String(Math.max(0, Math.ceil(s.continueTimer)));
      if (this.contTimerEl.textContent !== txt) this.contTimerEl.textContent = txt;
    }
    if (s.state === "ad") {
      const p = 1 - Math.max(0, s.adTimer) / Math.max(0.01, s.adTotal);
      if (this.adBarEl) this.adBarEl.style.width = `${p * 100}%`;
      if (this.adSkipEl) {
        const done = s.adTimer <= 0;
        this.adSkipEl.disabled = !done;
        const txt = done ? (s.adReason === "continue" ? "Wake up ▶" : "Continue ▶") : `Skip in ${Math.ceil(s.adTimer)}`;
        if (this.adSkipEl.textContent !== txt) this.adSkipEl.textContent = txt;
      }
    }
  }

  toast(text: string, kind = "info"): void {
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    el.textContent = text;
    this.toastLayer.appendChild(el);
    requestAnimationFrame(() => el.classList.add("in"));
    window.setTimeout(() => {
      el.classList.remove("in");
      el.classList.add("out");
      window.setTimeout(() => el.remove(), 420);
    }, 1200);
  }

  flash(kind: "perfect" | "fever" | "island" | "sleep"): void {
    this.flashEl.className = `flash show ${kind}`;
    window.setTimeout(() => this.flashEl.classList.remove("show"), 280);
  }

  private resizeObs: ResizeObserver | null = null;

  dispose(): void {
    this.resizeObs?.disconnect();
    this.menuSky.dispose();
    this.root.remove();
  }

  private renderStatic(s: HudSnapshot): void {
    if (s.state === "menu" || (s.state === "gameover" && s.screen !== "main")) {
      this.menuCard.className = `paper-card ${s.screen === "main" ? "menu-hero" : s.screen === "shop" || s.screen === "pass" ? "wide" : ""}`;
      this.menuCard.innerHTML = this.renderScreen(s);
    }
    if (s.state === "gameover") this.overCard.innerHTML = renderGameOver(s);
    if (s.state === "continue") {
      this.contCard.innerHTML = renderContinue(s);
      this.contTimerEl = this.contCard.querySelector('[data-live="contTimer"]');
    }
    if (s.state === "ad") {
      this.adCard.innerHTML = renderAd(s);
      this.adBarEl = this.adCard.querySelector('[data-live="adBar"]');
      this.adSkipEl = this.adCard.querySelector('[data-live="adSkip"]');
    }
    if (s.state === "playing") this.lastChips = "";
  }

  private renderScreen(s: HudSnapshot): string {
    switch (s.screen) {
      case "shop":
        return renderShop(s);
      case "paywall":
        return renderPaywall(s);
      case "checkout":
        return renderCheckout(s);
      case "settings":
        return renderSettings(s);
      case "scores":
        return renderScores(s);
      case "pass":
        return renderPass(s);
      case "trophies":
        return renderTrophies(s);
      case "account":
        return renderAccount(s);
      case "atlas":
        return renderAtlas(s);
      case "modes":
        return renderModes(s);
      case "board":
        return renderBoard(s);
      case "cups":
        return renderCups(s);
      case "live":
        return renderLive(s);
      case "rank":
        return renderRank(s);
      case "challenges":
        return renderChallenges(s);
      case "campaign":
        return renderCampaign(s);
      case "squad":
        return renderSquad(s);
      default:
        return renderMain(s);
    }
  }

  private bind(): void {
    const grab = (name: string): HTMLElement => this.root.querySelector(`[data-ref="${name}"]`) as HTMLElement;
    this.playHud = grab("playHud");
    this.distanceEl = grab("distance");
    this.coinsEl = grab("coins");
    this.bestEl = grab("best");
    this.islandEl = grab("island");
    this.multEl = grab("mult");
    this.goldChip = grab("goldChip");
    this.vipChip = grab("vipChip");
    this.ghostChip = grab("ghostChip");
    this.powersEl = grab("powers");
    this.sunFill = grab("sunFill");
    this.sunKnob = grab("sunKnob");
    this.feverWrap = grab("feverWrap");
    this.feverFill = grab("feverFill");
    this.hintEl = grab("hint");
    this.menuEl = grab("menu");
    // Living painted sky with the depth flock — sits behind the paper card.
    this.menuEl.insertBefore(this.menuSky.host, this.menuEl.firstChild);
    // Hero-bird overlay: appended last so the sunbird swoops over the card.
    this.menuEl.appendChild(this.menuSky.heroHost);
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObs = new ResizeObserver(() => this.menuSky.resize(this.menuEl.clientWidth, this.menuEl.clientHeight));
      this.resizeObs.observe(this.menuEl);
    }
    this.menuCard = grab("menuCard");
    this.pauseEl = grab("pause");
    this.contEl = grab("continue");
    this.contCard = grab("contCard");
    this.adEl = grab("ad");
    this.adCard = grab("adCard");
    this.overEl = grab("over");
    this.overCard = grab("overCard");
    this.toastLayer = grab("toasts");
    this.flashEl = grab("flash");
    this.comboEl = grab("combo");
    this.biomeChip = grab("biome");
    this.speedLines = grab("speedlines");
    this.handEl = grab("hand");
    this.altGauge = grab("altGauge");
    this.altFill = grab("altFill");
    this.altBird = grab("altBird");
    this.altRead = grab("altRead");
    this.launchBanner = grab("launchBanner");
    this.powerStrip = grab("powerStrip");
    this.countdownEl = grab("countdown");
    this.versusBar = grab("versusBar");
    this.matchmakingEl = grab("matchmaking");
    this.matchmakingCount = grab("matchmakingCount");
    this.matchmakingLabel = grab("matchmakingLabel");
    this.goalStrip = grab("goalStrip");
    this.goalPop = grab("goalPop");
    this.standingsEl = grab("standings");
    this.rosterBar = grab("rosterBar");
    this.draftMeter = grab("draftMeter");
    this.finishCd = grab("finishCd");
    this.emoteWheel = grab("emoteWheel");
  }
}

/* ---------- templates ---------- */

function hex(n: number): string {
  return `#${n.toString(16).padStart(6, "0")}`;
}

function head(title: string, backAction = "back", right = ""): string {
  return `<div class="screen-head"><button class="back-btn" data-ui data-action="${backAction}" aria-label="Back">‹</button><h2>${title}</h2><span>${right}</span></div>`;
}

function upsellStrip(): string {
  return `<button class="upsell" data-ui data-action="open-paywall"><div><b>✦ Sunbird Gold &amp; VIP</b><span>2× coins · no breaks · Phoenix &amp; Aurora skins · Nest Pass</span></div><span class="mini-btn gold">See</span></button>`;
}

function renderMissions(list: MissionView[], newly: string[] = []): string {
  return `<div class="missions"><div class="mission-head">Nest missions</div>${list
    .map((m) => {
      const fresh = newly.includes(m.def.id);
      return `<div class="mission ${m.done ? "done" : ""} ${fresh ? "fresh" : ""}">
        <span class="check">${m.done ? "✓" : ""}</span>
        <div><div class="mt">${m.def.title}</div><div class="md">${m.def.desc}</div></div>
        <span class="mp">${Math.min(m.progress, m.def.target)}/${m.def.target}</span>
      </div>`;
    })
    .join("")}</div>`;
}

function renderQuests(list: QuestView[]): string {
  return `<div class="quests"><div class="mission-head">Today's quests</div>${list
    .map((q) => {
      const pct = Math.min(100, (q.progress / q.def.target) * 100);
      return `<div class="quest ${q.done ? "done" : ""}">
        <div><div class="mt">${q.def.label}</div><div class="qb"><i style="width:${pct}%"></i></div></div>
        <span class="qr">${q.claimed ? "✓ claimed" : `● ${q.def.reward}`}</span>
      </div>`;
    })
    .join("")}</div>`;
}

function renderScoreTable(rows: HighScore[]): string {
  if (!rows.length) return `<div class="score-table"><div class="row empty">No flights yet</div></div>`;
  return `<div class="score-table">${rows
    .map(
      (h, i) =>
        `<div class="row ${h.vip ? "vip" : ""}"><span>${i + 1}${h.vip ? "<i class='spark'>✦</i>" : ""}</span><span>${formatDistance(h.distance)}</span><span>${h.coins}c</span><span>${Math.floor(h.score).toLocaleString()}</span></div>`,
    )
    .join("")}</div>`;
}

/** Board names come from a network payload — always escape before injecting. */
function escapeHtml(v: string): string {
  return v.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function renderBoard(s: HudSnapshot): string {
  const page = s.board;
  const scopes: { id: BoardScope; label: string }[] = [
    { id: "global", label: "All-time" },
    { id: "daily", label: "Today" },
    { id: "friends", label: "You" },
  ];
  const metrics: { id: BoardMetric; label: string }[] = [
    { id: "distance", label: "Distance" },
    { id: "altitude", label: "Altitude" },
    { id: "perfects", label: "Perfects" },
    { id: "coins", label: "Coins" },
  ];
  const fmt = (v: number): string =>
    s.boardMetric === "distance" || s.boardMetric === "altitude" ? `${Math.round(v)} m` : String(Math.round(v));

  // Never imply a device-only ladder is worldwide.
  const status = !s.boardOnline
    ? `<span class="board-badge local">On-device board</span>`
    : page?.stale
      ? `<span class="board-badge warn">Offline — showing cached</span>`
      : `<span class="board-badge live">Live global</span>`;

  const medals = ["🥇", "🥈", "🥉"];
  const rows =
    page && page.entries.length
      ? `<div class="board-podium">${page.entries
          .slice(0, 3)
          .map(
            (e, i) => `<div class="pod p${i + 1} ${e.you ? "you" : ""}">
              <span class="pod-medal">${medals[i]}</span>
              <span class="pod-name">${escapeHtml(e.name)}</span>
              <span class="pod-val">${fmt(e.value)}</span>
            </div>`,
          )
          .join("")}</div>` +
        page.entries
          .slice(3)
          .map(
            (e, i) => `<div class="board-row ${e.you ? "you" : ""}">
              <span class="bp">${i + 4}</span>
              <span class="bn">${escapeHtml(e.name)}</span>
              <span class="bv">${fmt(e.value)}</span>
            </div>`,
          )
          .join("")
      : `<div class="board-row empty">${s.boardLoading ? "Loading…" : "No flights recorded yet — be the first wing on the board"}</div>`;

  return `
    ${head("Leaderboard", "back", status)}
    <div class="seg">${scopes
      .map((x) => `<button data-ui data-action="board-scope" data-id="${x.id}" class="${s.boardScope === x.id ? "on" : ""}">${x.label}</button>`)
      .join("")}</div>
    <div class="seg wrap">${metrics
      .map((x) => `<button data-ui data-action="board-metric" data-id="${x.id}" class="${s.boardMetric === x.id ? "on" : ""}">${x.label}</button>`)
      .join("")}</div>
    <div class="board-list">${rows}</div>
    ${page && page.yourRank > 0 ? `<div class="board-rank">Your rank · <b>#${page.yourRank}</b> of ${page.total}</div>` : ""}
    <div class="redeem">
      <input data-ui data-ref="pilotName" maxlength="14" placeholder="Pilot name" value="${escapeHtml(s.pilotName)}" />
      <button class="mini-btn" data-ui data-action="rename-pilot">Save</button>
    </div>
    <button class="soft-btn wide" data-ui data-action="board-refresh">${s.boardLoading ? "Refreshing…" : "↻ Refresh"}</button>
    <p class="fineprint">${
      s.boardOnline
        ? "Scores sync to the configured global leaderboard service."
        : "Rankings are stored locally. Fly well to climb the leaderboard!"
    }</p>
  `;
}

function renderLive(s: HudSnapshot): string {
  const status = s.multiplayerLive
    ? s.netState === "racing" || s.netState === "lobby"
      ? `<span class="board-badge live">● Connected</span>`
      : s.netState === "connecting"
        ? `<span class="board-badge warn">Connecting…</span>`
        : `<span class="board-badge warn">${escapeHtml(s.netError || "Offline")}</span>`
    : `<span class="board-badge local">Solo field · practice</span>`;

  const featured = s.lobbyRivals.slice(0, 3);
  return `
    ${head("Race Lobby", "back", status)}
    <div class="vs-stage" aria-label="You versus the featured rivals">
      <div class="vs-you"><span class="vs-swatch" style="--body:#ff7a45;--wing:#ff9a62;--belly:#ffe6c4"><i class="w"></i><i class="b"></i><i class="e"></i></span><b>YOU</b><span class="vs-sub">${s.rival.divisionIcon} ${s.rival.division} · ${s.rival.rating}</span></div>
      <div class="vs-mark">VS</div>
      <div class="vs-foes">${featured.map((r) => `<div class="vs-foe ${r.tag.includes("live") ? "live" : ""}"><span class="vs-swatch" style="${r.tag.includes("live") ? "--body:#5eb7ea;--wing:#83cbf2;--belly:#eaf6ff" : "--body:#8a9bb0;--wing:#a8b8c8;--belly:#e8eef4"}"><i class="w"></i><i class="b"></i><i class="e"></i></span><b>${escapeHtml(r.name)}</b><span class="vs-sub">${escapeHtml(r.tag)}</span></div>`).join("")}</div>
    </div>

    <div class="lobby-rules">
      <span><b>4,000 m</b> gate</span><span class="dot"></span>
      <span><b>${s.roomSize + 1}</b> birds</span><span class="dot"></span>
      <span>Same hills · same wind</span>
    </div>

    <div class="room-controls">
      <div class="room-ctl">
        <span class="room-ctl-label">Field size</span>
        <div class="seg">${[5, 10, 20, 40]
          .map((n) => `<button data-ui data-action="room-size" data-id="${n}" class="${s.roomSize === n ? "on" : ""}">${n}</button>`)
          .join("")}</div>
      </div>
      <div class="room-ctl">
        <span class="room-ctl-label">Rival skill</span>
        <div class="seg">${(["chill", "sharp", "ace"] as const)
          .map((k) => `<button data-ui data-action="room-skill" data-id="${k}" class="${s.roomSkill === k ? "on" : ""}">${k === "chill" ? "😌 Chill" : k === "sharp" ? "🎯 Sharp" : "🔥 Ace"}</button>`)
          .join("")}</div>
      </div>
    </div>

    <div class="loadout-card">
      <div class="loadout-row"><span>🐦 ${s.loadout.bird}</span><span>${s.loadout.trail}</span><span>🎒 ${s.loadout.boosts} armed</span></div>
      <button class="mini-btn" data-ui data-action="open-shop">Change loadout</button>
    </div>

    <button class="primary-btn race40 hero" data-ui data-action="quick-match"><span class="hero-label">⚡ START RACE</span><span class="hero-hint">ranked · rating on the line</span></button>
    <button class="soft-btn wide" data-ui data-action="pvp-casual">Casual start · no rating change</button>
    <button class="soft-btn wide storm-cta" data-ui data-action="pvp-storm">⛈ Stormfront Royale · PvE storm × PvP race</button>

    <div class="race-grid">
      <div class="race-card">
        <div class="race-card-h"><b>Private room</b><span>race friends</span></div>
        <div class="code-row big">
          <span class="code">${s.roomCode ? escapeHtml(s.roomCode) : "— — — — —"}</span>
          <button class="mini-btn gold" data-ui data-action="host-room">${s.roomCode ? "New" : "Host"}</button>
        </div>
        <div class="redeem">
          <input data-ui data-ref="roomCode" maxlength="5" placeholder="CODE" autocomplete="off" style="text-transform:uppercase" />
          <button class="mini-btn" data-ui data-action="join-room">Join</button>
        </div>
      </div>
      <div class="race-card craft">
        <div class="race-card-h"><b>Race craft</b><span>win the pack</span></div>
        <div class="race-tip"><b>🌀 Draft</b><span>Tuck behind a rival to cut drag, then slingshot past.</span></div>
        <div class="race-tip"><b>👑 Roster</b><span>Every bird rides the top rail — you are gold.</span></div>
        <div class="race-tip"><b>📸 Finish</b><span>Cross within a wing-length for a photo finish.</span></div>
      </div>
    </div>

    ${s.nemesis ? `<div class="reward-strip nest nemesis">Rival: <b>${escapeHtml(s.nemesis)}</b> beat you last race. <button class="mini-btn gold" data-ui data-action="quick-match">Settle it</button></div>` : ""}
    <button class="ghost-btn" data-ui data-action="menu">Back out</button>
    <p class="fineprint">${
      s.multiplayerLive
        ? "Connected to the configured race server. Finish order is decided server-side."
        : "Race against AI pilots on today's hills. Each pilot flies the same terrain with unique skill levels."
    }</p>
  `;
}

function renderChallenges(s: HudSnapshot): string {
  const d = s.daily;
  const g = s.gauntlet;
  const c = s.calendar;
  const daily = `
    <div class="section-title">Daily challenge <small>resets at midnight</small></div>
    <div class="daily-card ${d.done ? "done" : ""}">
      <div class="daily-head"><span class="daily-icon">${d.modeIcon}</span><div><b>${d.title}</b><em>${d.modeName} · ${escapeHtml(d.metric)} ≥ ${d.target}</em></div><span class="pill coin">● ${d.reward}</span></div>
      <div class="daily-mod"><b>${d.modifierIcon} ${d.modifierLabel}</b><span>${escapeHtml(d.modifierDesc)}</span></div>
      ${
        d.done
          ? `<div class="reward-strip">✓ Complete · come back tomorrow (${d.dailiesDone} lifetime)</div>`
          : `<button class="primary-btn" data-ui data-action="play-daily">☀ FLY THE CHALLENGE</button>`
      }
    </div>`;

  const gauntlet = `
    <div class="section-title">Weekly gauntlet <small>3 stages · resets Monday</small></div>
    <div class="gauntlet">
      ${g.stages
        .map(
          (st) => `<div class="g-stage ${st.done ? "done" : ""}">
            <span class="g-num">${st.done ? "✓" : st.index + 1}</span>
            <div class="g-body"><b>${st.modeIcon} ${escapeHtml(st.label)}</b><em>${st.modeName} · ${escapeHtml(st.metric)} ≥ ${st.target}</em></div>
            ${st.done ? `<span class="tag on">Clear</span>` : `<button class="mini-btn" data-ui data-action="play-gauntlet" data-id="${st.index}">● ${st.reward}</button>`}
          </div>`,
        )
        .join("")}
      <div class="g-bonus ${g.cleared ? "done" : ""}">${g.cleared ? `🏆 Gauntlet cleared this week · +${g.clearBonus} paid` : `Clear all 3 → +${g.clearBonus} coins`}${g.lifetimeClears > 0 ? ` · ${g.lifetimeClears} lifetime clears` : ""}</div>
    </div>`;

  const calendar = `
    <div class="section-title">Login calendar <small>day ${c.cycleDay || "—"} of 28</small></div>
    <div class="cal-grid">
      ${c.days
        .map(
          (day) =>
            `<div class="cal-day ${day.claimed ? "claimed" : ""} ${day.today ? "today" : ""} ${day.milestone ? "milestone" : ""}"><span class="cal-num">${day.day}</span><span class="cal-r">${day.label}</span></div>`,
        )
        .join("")}
    </div>
    ${
      c.claimedToday
        ? `<div class="reward-strip">📅 Today's gift claimed — see you tomorrow</div>`
        : `<button class="primary-btn" data-ui data-action="claim-calendar">📅 CLAIM TODAY'S GIFT</button>`
    }`;

  const mastery = `
    <div class="section-title">Mode mastery <small>fly every mode</small></div>
    <div class="mastery-list">
      ${s.mastery
        .map(
          (m) => `<div class="mastery-row ${m.maxed ? "maxed" : ""}">
            <span class="m-icon">${m.icon}</span>
            <div class="m-body"><b>${m.name}${m.maxed ? ` <span class="m-skill">★ ${m.skillName}</span>` : ""}</b>
            <em>${
              m.maxed
                ? `Mastered · ${m.skillDesc} — always on in this mode`
                : `${m.runs} runs · next level at ${m.nextAt}${m.perk ? ` · ${m.perk}` : ` · Lv.5 skill: ${m.skillName} (${m.skillDesc})`}`
            }</em>
            ${m.maxed ? "" : `<div class="qb"><i style="width:${Math.round(m.progress * 100)}%"></i></div>`}</div>
            <span class="m-stars">${"★".repeat(m.level)}${"☆".repeat(Math.max(0, 5 - m.level))}</span>
          </div>`,
        )
        .join("")}
    </div>`;

  const ev = s.weeklyEvent;
  const th = s.monthlyTheme;
  const trailDone = s.themeTrailClaimed;
  const event = `
    <div class="section-title">Live event <small>new twist every week</small></div>
    <div class="event-card">
      <div class="daily-head"><span class="daily-icon">${ev.icon}</span><div><b>${ev.name}</b><em>${escapeHtml(ev.desc)}</em></div><span class="pill coin">● ${ev.reward}</span></div>
      <div class="event-meta"><span>Fly ${ev.target.toLocaleString()} m in one event run</span><span>${s.eventClearsWeek > 0 ? `✓ ${s.eventClearsWeek} clear${s.eventClearsWeek > 1 ? "s" : ""} this week` : "No clears yet this week"}</span></div>
      <button class="primary-btn" data-ui data-action="play-event">${ev.icon} FLY THE EVENT</button>
      <div class="theme-strip ${trailDone ? "done" : ""}">
        <span class="theme-icon">${th.icon}</span>
        <div class="theme-body"><b>${th.name}</b><em>${escapeHtml(th.tagline)}</em></div>
        <span class="theme-prog">${trailDone ? "✨ trail claimed" : `${Math.min(s.eventClearsMonth, s.themeTrailNeed)}/${s.themeTrailNeed} clears → trail`}</span>
      </div>
    </div>`;

  return `
    ${head("Challenges", "back", `<span class="pill">☀ Daily · 🌩 Weekly</span>`)}
    <p class="tagline">Same hills as everyone else today. Modifiers change how you fly them.</p>
    ${event}
    ${daily}
    ${gauntlet}
    ${calendar}
    ${mastery}
  `;
}

function renderCampaign(s: HudSnapshot): string {
  const rows = s.campaign
    .map((ch) => {
      const goals = ch.goals
        .map(
          (g) => `<div class="camp-goal ${g.done ? "done" : ""}">
            <span class="check">${g.done ? "✓" : ""}</span>
            <span class="cg-label">${escapeHtml(g.def.label)}</span>
            <span class="cg-prog">${Math.floor(g.progress).toLocaleString()}/${g.def.target.toLocaleString()}</span>
          </div>`,
        )
        .join("");
      const cta = !ch.unlocked
        ? `<span class="tag">🔒 Finish chapter ${ch.index} first</span>`
        : ch.claimed
          ? `<span class="tag on">✓ ${escapeHtml(ch.def.rewardLabel)}</span>`
          : ch.complete
            ? `<button class="mini-btn gold" data-ui data-action="claim-campaign" data-id="${ch.def.id}">CLAIM ● ${ch.def.rewardCoins}</button>`
            : `<span class="tag">● ${ch.def.rewardCoins} on completion</span>`;
      return `<div class="camp-chapter ${!ch.unlocked ? "locked" : ""} ${ch.claimed ? "claimed" : ""}">
        <div class="camp-head"><span class="camp-icon">${ch.def.icon}</span><div><b>Chapter ${ch.index + 1} · ${escapeHtml(ch.def.title)}</b><em>${escapeHtml(ch.def.story)}</em></div></div>
        ${ch.unlocked ? goals : ""}
        <div class="camp-foot">${cta}</div>
      </div>`;
    })
    .join("");
  return `
    ${head("The Long Migration", "back", `<span class="pill">${s.campaignDone}/${s.campaignTotal}</span>`)}
    <p class="tagline">A journey in eight chapters. Progress accrues from every flight — no separate grind.</p>
    <div class="camp-list">${rows}</div>
  `;
}

function renderSquad(s: HudSnapshot): string {
  const sq = s.squad;
  if (!sq.live) {
    return `
      ${head("Squad", "back")}
      <p class="tagline">Friends, clubs and club chat live on the social server.</p>
      <div class="empty-note">🔌 Social server not configured.<br/><small>Set <b>VITE_SOCIAL_URL</b> and restart — see SOCIAL_API.md. No fake friends here, ever.</small></div>
    `;
  }
  const notice = s.squadNotice ? `<div class="reward-strip">${escapeHtml(s.squadNotice)}</div>` : "";
  const friends = `
    <div class="section-title">Friends <small>${sq.friends.length} winged</small></div>
    <div class="redeem"><input data-ui data-ref="squadCode" placeholder="Friend's code (SUN-XXXXXX)" maxlength="10" autocomplete="off" /><button class="mini-btn" data-ui data-action="squad-add">Add</button></div>
    ${
      sq.friends.length
        ? `<div class="friend-list">${sq.friends
            .map(
              (f) => `<div class="friend-row"><span class="fr-name">🐦 ${escapeHtml(f.name)}</span><span class="fr-code">${escapeHtml(f.code)}</span><button class="mini-btn ghost" data-ui data-action="squad-remove" data-id="${escapeHtml(f.code)}">✕</button></div>`,
            )
            .join("")}</div>`
        : `<div class="empty-note">No friends yet — swap codes! Yours is <b>${escapeHtml(sq.myCode || "…")}</b></div>`
    }`;
  const myClub = sq.clubs.find((c) => c.id === sq.myClubId);
  const clubs = myClub
    ? `
    <div class="section-title">Your club <small>${myClub.members}/30 members</small></div>
    <div class="club-card mine">
      <div class="daily-head"><span class="daily-icon">🏰</span><div><b>${escapeHtml(myClub.name)}</b><em>${escapeHtml(myClub.motto)}</em></div><button class="mini-btn ghost" data-ui data-action="squad-leave-club">Leave</button></div>
      <div class="chat-box" data-ref="chatBox">${
        sq.chat.length
          ? sq.chat.map((m) => `<div class="chat-msg"><b>${escapeHtml(m.name)}</b><span>${escapeHtml(m.text)}</span></div>`).join("")
          : `<div class="chat-msg dim"><span>Quiet in here. Say hi 👋</span></div>`
      }</div>
      <div class="redeem"><input data-ui data-ref="chatText" placeholder="Message your club…" maxlength="200" autocomplete="off" /><button class="mini-btn" data-ui data-action="squad-chat">Send</button></div>
    </div>`
    : `
    <div class="section-title">Clubs <small>join or found one</small></div>
    ${
      sq.clubs.length
        ? `<div class="club-list">${sq.clubs
            .map(
              (c) => `<div class="club-row"><div><b>🏰 ${escapeHtml(c.name)}</b><em>${escapeHtml(c.motto)} · ${c.members}/30</em></div><button class="mini-btn" data-ui data-action="squad-join-club" data-id="${c.id}" ${c.members >= 30 ? "disabled" : ""}>Join</button></div>`,
            )
            .join("")}</div>`
        : `<div class="empty-note">No clubs yet — found the first one.</div>`
    }
    <div class="redeem"><input data-ui data-ref="clubName" placeholder="Club name" maxlength="24" autocomplete="off" /><button class="mini-btn gold" data-ui data-action="squad-create-club">Found club</button></div>`;
  return `
    ${head("Squad", "back", sq.myCode ? `<span class="pill">${escapeHtml(sq.myCode)}</span>` : "")}
    <p class="tagline">Real pilots only — friends, clubs and club chat.</p>
    ${sq.loading ? `<div class="reward-strip">↻ Syncing with the roost…</div>` : ""}
    ${sq.error ? `<div class="empty-note">⚠ ${escapeHtml(sq.error)}</div>` : ""}
    ${notice}
    ${friends}
    ${clubs}
    <button class="soft-btn wide" data-ui data-action="squad-refresh">↻ Refresh</button>
  `;
}

function renderRank(s: HudSnapshot): string {
  const r = s.rival;
  const wl = r.wins + r.losses > 0 ? Math.round((r.wins / (r.wins + r.losses)) * 100) : 0;
  return `
    ${head("Rival Rank", "back", `<span class="pill">● Local</span>`)}
    <div class="rank-hero">
      <div class="rank-div-big">${r.divisionIcon}</div>
      <div class="rank-hero-num">${r.rating}</div>
      <div class="rank-hero-div">${r.division}</div>
      <div class="rank-bar big"><i style="width:${Math.round(r.progress * 100)}%"></i></div>
      <div class="rank-hero-next">${r.nextNeeded > 0 ? `${r.nextNeeded} rating to ${r.nextName}` : "Top division — defend it"}</div>
    </div>
    <div class="rank-stats">
      <div><span>W–L</span><b>${r.wins}–${r.losses}</b></div>
      <div><span>Win rate</span><b>${wl}%</b></div>
      <div><span>Streak</span><b class="streak-b ${r.streak > 0 ? "lit" : ""}"><svg viewBox="0 0 24 24" class="fl"><path d="M12 2C13 6 17 8 17 13a5 5 0 0 1-10 0c0-2 1-3.4 2-4.6 0 1.6.6 2.6 1.8 3 -.4-3.4 1.4-6.6 1.2-9.4z" fill="currentColor"/></svg>${r.streak}</b></div>
      <div><span>Best</span><b>×${r.bestStreak}</b></div>
    </div>
    <div class="season-card">
      <div class="season-head"><b>Season</b><span class="pill">${r.season.daysLeft}d left</span></div>
      <div class="season-body">Peak ${r.season.peakIcon} ${r.season.peak} · pays <b>● ${r.season.rewardCoins}</b> at reset, then ratings drift halfway back to 1000.</div>
    </div>
    <div class="section-title">Recent races <small>this device only</small></div>
    ${
      r.matches.length
        ? `<div class="match-list">${[...r.matches]
            .reverse()
            .map(
              (m) =>
                `<div class="match-row ${m.won ? "won" : ""}"><span class="m-place">${m.won ? "🏅" : ""}P${m.place}</span><span class="m-meta">of ${m.field} · ${escapeHtml(m.mode)}</span><span class="m-date">${escapeHtml(m.date)}</span></div>`,
            )
            .join("")}</div>`
        : `<p class="fineprint">No ranked races yet. Your first 40-bird finish sets the tone.</p>`
    }
    <div class="section-title">Duels <small>ranked 1v1 · ±16 rating</small></div>
    <div class="duel-card">
      <div class="vs-stage slim">
        <div class="vs-you"><span class="vs-swatch" style="--body:#ff7a45;--wing:#ff9a62;--belly:#ffe6c4"><i class="w"></i><i class="b"></i><i class="e"></i></span><b>YOU</b><span class="vs-sub">${r.rating}</span></div>
        <div class="vs-mark">VS</div>
        <div class="vs-foes"><div class="vs-foe"><span class="vs-swatch" style="--body:#8a9bb0;--wing:#a8b8c8;--belly:#e8eef4"><i class="w"></i><i class="b"></i><i class="e"></i></span><b>${escapeHtml(s.duelFoe.name)}</b><span class="vs-sub">${escapeHtml(s.duelFoe.tag)} · ~${s.duelFoe.rating}</span></div></div>
      </div>
      <div class="rank-stats">
        <div><span>Duel W–L</span><b>${s.duel.wins}–${s.duel.losses}</b></div>
        <div><span>Streak</span><b class="streak-b ${s.duel.streak > 0 ? "lit" : ""}"><svg viewBox="0 0 24 24" class="fl"><path d="M12 2C13 6 17 8 17 13a5 5 0 0 1-10 0c0-2 1-3.4 2-4.6 0 1.6.6 2.6 1.8 3 -.4-3.4 1.4-6.6 1.2-9.4z" fill="currentColor"/></svg>${s.duel.streak}</b></div>
        <div><span>Best</span><b>×${s.duel.bestStreak}</b></div>
        <div><span>Prize</span><b>${s.duel.wins >= 10 ? "🐦 won" : `${s.duel.wins}/10`}</b></div>
      </div>
      <button class="primary-btn hero" data-ui data-action="pvp-duel"><span class="hero-label">⚔ DUEL</span><span class="hero-hint">1v1 · first to 4,000 m · win 10 for the Hummingbird</span></button>
    </div>
    <button class="primary-btn race40 hero" data-ui data-action="pvp-ranked"><span class="hero-label">⚔ RACE RANKED</span><span class="hero-hint">climb or defend ${r.division}</span></button>
    <p class="fineprint">Your rating changes based on how you finish in ranked 40-bird races and duels. Reaching Sunbird Legend unlocks the Solstice bird. Seasons soft-reset monthly with a division reward.</p>
  `;
}

function renderCups(s: HudSnapshot): string {
  const hrs = (ms: number): string => {
    const h = Math.floor(ms / 3600000);
    return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h`;
  };
  const cups = s.cups
    .map((c) => {
      const tierLabel = c.tier ? c.tier.toUpperCase() : "UNRANKED";
      const prize = c.tier ? c.def.prizes[c.tier] : null;
      return `<div class="cup-card ${c.tier ?? ""}">
        <div class="cup-head"><span class="cup-icon">${c.def.icon}</span>
          <div><b>${c.def.name}</b><em>${c.def.blurb}</em></div>
          <span class="cup-timer">${hrs(c.endsInMs)} left</span>
        </div>
        <div class="cup-meta"><span class="cup-tier ${c.tier ?? "none"}">${tierLabel}</span><span>Best ${Math.round(c.entry.best)}</span><span>${c.entry.attempts} runs</span></div>
        <div class="qb"><i style="width:${Math.round(c.progress * 100)}%"></i></div>
        <div class="cup-next">${c.nextTier ? `Next: ${c.nextTier} at ${Math.round(c.nextCut)}` : "Diamond secured"}</div>
        ${
          c.claimable && prize
            ? `<button class="mini-btn gold" data-ui data-action="claim-cup" data-id="${c.def.id}">Claim ${prize.icon} ${prize.label}</button>`
            : `<button class="mini-btn" data-ui data-action="pick-mode" data-id="${c.def.mode}">Fly ${c.def.mode}</button>`
        }
      </div>`;
    })
    .join("");

  const trails = s.trails.length
    ? `<div class="section-title">Prize trails</div><div class="btn-row">${s.trails
        .map((t) => `<button class="soft-btn ${t.equipped ? "gold" : ""}" data-ui data-action="equip-trail" data-id="${t.id}">${t.equipped ? "✓ " : ""}${t.label}</button>`)
        .join("")}</div>`
    : "";

  return `
    ${head("Tournaments", "back", `<span class="pill">Weekly</span>`)}
    <p class="tagline">Two cups run every week. Beat a division cut-off, then claim the prize — it lands in your account immediately.</p>
    <div class="cup-list">${cups}</div>
    ${s.lastPrize ? `<div class="reward-strip">Last prize · ${s.lastPrize}</div>` : ""}
    ${trails}
    <p class="fineprint">Cups reset every Monday. Won cosmetics are permanent.</p>
  `;
}

function renderModes(s: HudSnapshot): string {
  return `
    ${head("Game modes")}
    <p class="tagline">Same hills, different pressure. Every mode shares your unlocks.</p>
    <div class="mode-list">
      ${s.modes
        .map(
          (m) => `<button class="mode-card ${m.id === s.modeId ? "on" : ""}" data-ui data-action="pick-mode" data-id="${m.id}">
            <span class="mode-icon">${m.icon}</span>
            <span class="mode-body"><b>${m.name}</b><em>${m.blurb}</em></span>
            <span class="mode-meta">${m.finish ? `${m.finish / 1000} km` : m.clock ? `${m.clock}s` : "∞"}</span>
          </button>`,
        )
        .join("")}
    </div>
    <button class="soft-btn wide" data-ui data-action="versus">👥 Local 2-player race</button>
  `;
}

function renderVersusResult(s: HudSnapshot): string {
  const a = s.p1Stats!;
  const b = s.p2Stats!;
  const row = (label: string, x: number, y: number, fmt: (n: number) => string): string => {
    const win = x === y ? 0 : x > y ? 1 : 2;
    const max = Math.max(x, y, 1);
    return `<div class="vs-stat">
      <span class="${win === 1 ? "w" : ""}">${fmt(x)}</span>
      <em>${label}<i class="vs-bars"><b class="l" style="width:${Math.round((x / max) * 100)}%"></b><b class="r" style="width:${Math.round((y / max) * 100)}%"></b></i></em>
      <span class="${win === 2 ? "w" : ""}">${fmt(y)}</span>
    </div>`;
  };
  const time = (r: RacerStats): string => (r.finishedAt > 0 ? `${r.finishedAt.toFixed(1)}s` : "DNF");
  const margin =
    a.finishedAt > 0 && b.finishedAt > 0 ? Math.abs(a.finishedAt - b.finishedAt).toFixed(1) + "s" : "by distance";
  return `
    <div class="vs-hero ${s.versusWinner === 1 ? "p1win" : "p2win"}">
      <span class="vs-crown-big">🏆</span>
      <div class="vs-winner">PLAYER ${s.versusWinner} WINS</div>
      <div class="vs-margin">by ${margin} · same device, same hills</div>
    </div>
    <div class="vs-head"><span class="p1">🟠 P1 · SPACE / left half</span><span class="p2">P2 · ENTER / right half 🔵</span></div>
    <div class="vs-stats">
      <div class="vs-stat time"><span>${time(a)}</span><em>race time</em><span>${time(b)}</span></div>
      ${row("distance", a.distance, b.distance, (n) => `${Math.round(n)}m`)}
      ${row("max altitude", a.maxAltitude, b.maxAltitude, (n) => `${Math.round(n)}m`)}
      ${row("perfect ramps", a.perfects, b.perfects, (n) => String(n))}
      ${row("best combo", a.bestCombo, b.bestCombo, (n) => `×${n}`)}
      ${row("coins", a.coins, b.coins, (n) => String(n))}
      ${row("top speed", a.topSpeed, b.topSpeed, (n) => `${Math.round(n)}`)}
    </div>
    <button class="primary-btn hero" data-ui data-action="versus"><span class="hero-label">REMATCH</span><span class="hero-hint">swap sides for fairness</span></button>
    <button class="ghost-btn" data-ui data-action="menu">Menu</button>
  `;
}

function renderAtlas(s: HudSnapshot): string {
  return `
    ${head("Island Atlas", "back", `<span class="pill">Farthest: ${s.farthestIsland + 1}</span>`)}
    <p class="tagline">Every island has its own weather. Learn them, then chain them.</p>
    <div class="atlas">
      ${s.atlas
        .map(
          (a) => `<div class="atlas-card ${a.reached ? "reached" : ""}" style="--c:${a.color}">
            <div class="atlas-num">Island ${a.island + 1}</div>
            <div class="atlas-emoji">${a.reached ? a.emoji : "❔"}</div>
            <div class="atlas-name">${a.reached ? a.name : "Unknown shores"}</div>
            <div class="atlas-tag">${a.reached ? a.tagline : "Reach it to chart it"}</div>
            ${a.reached && a.hazard !== "none" ? `<div class="atlas-hazard">${a.hazard === "gust" ? "🌬 headwinds" : "🌩 ash storms"}</div>` : ""}
          </div>`,
        )
        .join("")}
    </div>
    <div class="field-guide">
      <div class="mission-head">Field guide</div>
      <div class="fg-row"><b>♨ Thermals</b> Shimmering columns. <em>Release</em> inside one to ride it up.</div>
      <div class="fg-row"><b>🌬 Headwinds</b> Slow you in the air. <em>Hold</em> to tuck and punch through.</div>
      <div class="fg-row"><b>🌩 Ash storms</b> Sap your speed. Fly beneath them, or dive early.</div>
      <div class="fg-row"><b>❄ Snow caps</b> Just pretty — but the peaks are taller. Build speed before them.</div>
    </div>
  `;
}

function renderMain(s: HudSnapshot): string {
  const portal = s.portalName !== "none";
  const modes: { id: SeedMode; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "yesterday", label: "Yesterday" },
    { id: "random", label: "Wild" },
  ];
  const seedPicker = !portal && s.gold
    ? `<div class="seg">${modes
        .map((m) => `<button data-ui data-action="seed-${m.id}" class="${s.seedMode === m.id ? "on" : ""}">${m.label}</button>`)
        .join("")}</div>`
    : portal
      ? `<p class="portal-note">${s.portalName === "poki" ? "Poki edition · portal rewards enabled" : s.portalName === "crazy" ? "CrazyGames edition · portal rewards enabled" : "Portal edition"}</p>`
      : `<button class="lock-chip" data-ui data-action="open-paywall">✦ Pick your hills with Gold</button>`;
  return `
    <header class="hero">
      <div class="hero-sun" aria-hidden="true"></div>
      <div class="hero-title">
        <span class="hero-kicker">chase the daylight</span>
        <h1>SUNBIRD</h1>
        <p class="hero-sub">Dive the valleys · ride the ridgeline · outrun the sunset</p>
      </div>
    </header>

    <div class="hero-meta">
      <span class="pill seed-pill">${s.seedLabel}</span>
    </div>
    ${s.rivalBanner ? renderRivalBanner(s.rivalBanner) : ""}
    ${seedPicker}

    <!-- MAIN PLAY MODES: 1P · PVP · PVE · TOURNAMENT -->
    <div class="mode-cards" role="group" aria-label="Play modes">
      <button class="mode-card-main" data-ui data-action="pvp-practice">
        <span class="mode-icon-lg"><svg class="mi" viewBox="0 0 48 48"><defs><linearGradient id="gSun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd76a"/><stop offset="1" stop-color="#ff9a3a"/></linearGradient></defs><circle cx="24" cy="22" r="9" fill="url(#gSun)"/><g stroke="url(#gSun)" stroke-width="3" stroke-linecap="round"><line x1="24" y1="5" x2="24" y2="10"/><line x1="24" y1="34" x2="24" y2="39"/><line x1="7" y1="22" x2="12" y2="22"/><line x1="36" y1="22" x2="41" y2="22"/><line x1="11.5" y1="9.5" x2="15" y2="13"/><line x1="33" y1="31" x2="36.5" y2="34.5"/><line x1="36.5" y1="9.5" x2="33" y2="13"/><line x1="15" y1="31" x2="11.5" y2="34.5"/></g><path d="M14 42 Q20 36 24 40 Q28 36 34 42" fill="none" stroke="#e8862a" stroke-width="2.6" stroke-linecap="round"/></svg></span>
        <span class="mode-name">1 PLAYER</span>
        <span class="mode-desc">Free flight — hold to dive, release to soar</span>
      </button>
      <button class="mode-card-main pvp" data-ui data-action="open-live">
        <span class="mode-icon-lg"><svg class="mi" viewBox="0 0 48 48"><defs><linearGradient id="gPvp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7a6a"/><stop offset="1" stop-color="#d84a5a"/></linearGradient></defs><g stroke="url(#gPvp)" stroke-width="3.4" stroke-linecap="round"><line x1="10" y1="10" x2="34" y2="34"/><line x1="38" y1="10" x2="14" y2="34"/></g><g stroke="#a83a4a" stroke-width="3.4" stroke-linecap="round"><line x1="31" y1="37" x2="37" y2="31"/><line x1="11" y1="31" x2="17" y2="37"/></g><circle cx="24" cy="22" r="4.5" fill="#fff" opacity="0.9"/></svg></span>
        <span class="mode-name">PVP</span>
        <span class="mode-desc">Race 40 pilots · duels · rooms</span>
      </button>
      <button class="mode-card-main pve" data-ui data-action="open-challenges">
        <span class="mode-icon-lg"><svg class="mi" viewBox="0 0 48 48"><defs><linearGradient id="gPve" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6ab8ff"/><stop offset="1" stop-color="#3a7ad8"/></linearGradient></defs><circle cx="24" cy="24" r="16" fill="none" stroke="url(#gPve)" stroke-width="3.4"/><circle cx="24" cy="24" r="9" fill="none" stroke="url(#gPve)" stroke-width="3"/><circle cx="24" cy="24" r="3.2" fill="url(#gPve)"/></svg></span>
        <span class="mode-name">PVE</span>
        <span class="mode-desc">Daily challenge & storm gauntlet</span>
      </button>
      <button class="mode-card-main cup" data-ui data-action="open-cups">
        <span class="mode-icon-lg"><svg class="mi" viewBox="0 0 48 48"><defs><linearGradient id="gCup" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#e8a020"/></linearGradient></defs><path d="M15 8h18v10a9 9 0 0 1-18 0z" fill="url(#gCup)"/><path d="M15 10H8a7 7 0 0 0 7 9M33 10h7a7 7 0 0 1-7 9" fill="none" stroke="url(#gCup)" stroke-width="3"/><rect x="21" y="26" width="6" height="7" fill="url(#gCup)"/><path d="M16 36h16v4H16z" fill="#c8871a"/></svg></span>
        <span class="mode-name">TOURNAMENT</span>
        <span class="mode-desc">Weekly cups — win exclusive gear</span>
      </button>
    </div>

    <button class="rank-card" data-ui data-action="open-rank" aria-label="View Rival rank">
      <span class="rank-div">${s.rival.divisionIcon} ${s.rival.division}</span>
      <span class="rank-num">${s.rival.rating}</span>
      <span class="rank-bar"><i style="width:${Math.round(s.rival.progress * 100)}%"></i></span>
      <span class="rank-sub">${
        s.rival.nextNeeded > 0
          ? `${s.rival.nextNeeded} to ${s.rival.nextName}`
          : "Top division — defend it"
      } · 🔥${s.rival.streak} streak</span>
    </button>

    <div class="pvp-modes" role="group" aria-label="Play modes">
      <button class="pvp-mode rated" data-ui data-action="pvp-ranked"><i>🏆</i><b>Ranked 40</b><span>Rating moves</span></button>
      <button class="pvp-mode rated" data-ui data-action="pvp-duel"><i>⚔</i><b>Duel 1v1</b><span>±16 rating</span></button>
      <button class="pvp-mode" data-ui data-action="pvp-casual"><i>🐦</i><b>Casual 40</b><span>No rating</span></button>
      <button class="pvp-mode storm" data-ui data-action="pvp-storm"><i>⛈</i><b>Stormfront</b><span>PvE × PvP</span></button>
      <button class="pvp-mode" data-ui data-action="versus"><i>👥</i><b>Local 2P</b><span>Same screen</span></button>
    </div>

    <button class="daily-strip ${s.daily.done ? "done" : ""}" data-ui data-action="${s.daily.done ? "open-challenges" : "play-daily"}">
      <span class="ds-icon">${s.daily.done ? "✓" : s.daily.modifierIcon}</span>
      <span class="ds-body"><b>Daily · ${s.daily.title}</b><em>${s.daily.done ? "Complete — gauntlet & calendar inside" : `${s.daily.modifierLabel} · ${escapeHtml(s.daily.metric)} ≥ ${s.daily.target} · ● ${s.daily.reward}`}</em></span>
      <span class="ds-go">${s.daily.done ? "›" : "FLY"}</span>
    </button>
    <button class="event-strip" data-ui data-action="play-event">
      <span class="ds-icon">${s.weeklyEvent.icon}</span>
      <span class="ds-body"><b>Event · ${s.weeklyEvent.name}</b><em>${s.monthlyTheme.icon} ${s.monthlyTheme.name} · fly ${s.weeklyEvent.target.toLocaleString()} m · ● ${s.weeklyEvent.reward}</em></span>
      <span class="ds-go">${s.eventClearsWeek > 0 ? `✓${s.eventClearsWeek}` : "FLY"}</span>
    </button>
    ${!s.calendar.claimedToday ? `<button class="cal-strip" data-ui data-action="claim-calendar">📅 Daily gift ready — day ${(s.calendar.cycleDay % 28) + 1} of 28 <b>CLAIM</b></button>` : ""}

    <div class="loadout-strip">
      <span class="loadout-bird">🐦 ${s.loadout.bird}</span>
      <span class="loadout-trail">${s.loadout.trail}</span>
      <span class="loadout-boost">🎒 ${s.loadout.boosts} armed</span>
      <button class="mini-btn" data-ui data-action="open-shop">Loadout</button>
    </div>

    <div class="how"><div><b>HOLD</b> to dive</div><div class="dot"></div><div><b>RELEASE</b> to glide</div></div>

    <nav class="nav-grid compact">
      <button class="nav-btn" data-ui data-action="mode-select"><i>🎯</i><span>Modes</span></button>
      <button class="nav-btn" data-ui data-action="open-challenges"><i>☀</i><span>Daily</span></button>
      <button class="nav-btn" data-ui data-action="open-live"><i>🐦</i><span>Race</span></button>
      <button class="nav-btn" data-ui data-action="open-board"><i>🌍</i><span>Board</span></button>
      <button class="nav-btn" data-ui data-action="open-cups"><i>🏆</i><span>Cups</span></button>
      <button class="nav-btn" data-ui data-action="open-shop"><i><svg viewBox="0 0 24 24" class="ti"><path d="M6 8h12l-1.2 12H7.2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="2"/></svg></i><span>Shop</span></button>
      <button class="nav-btn" data-ui data-action="open-pass"><i><svg viewBox="0 0 24 24" class="ti"><path d="M4 9a2 2 0 0 0 0 6v3h16v-3a2 2 0 0 1 0-6V6H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><line x1="14" y1="6" x2="14" y2="18" stroke="currentColor" stroke-width="2" stroke-dasharray="2 2.4"/></svg></i><span>Pass ${s.season.tier}</span></button>
      <button class="nav-btn" data-ui data-action="open-trophies"><i>🏅</i><span>${s.trophyCounts.unlocked}/${s.trophyCounts.total}</span></button>
      <button class="nav-btn" data-ui data-action="open-rank"><i>⚔</i><span>Rank</span></button>
      <button class="nav-btn" data-ui data-action="open-campaign"><i>🧭</i><span>Story ${s.campaignDone}/${s.campaignTotal}</span></button>
      <button class="nav-btn" data-ui data-action="open-squad"><i>🤝</i><span>Squad</span></button>
      <button class="nav-btn" data-ui data-action="open-atlas"><i>🗺</i><span>Atlas</span></button>
      <button class="nav-btn" data-ui data-action="open-scores"><i>📈</i><span>Scores</span></button>
      <button class="nav-btn" data-ui data-action="open-account"><i>👤</i><span>Account</span></button>
      <button class="nav-btn" data-ui data-action="open-settings" aria-label="Settings"><i>⚙</i><span>Settings</span></button>
    </nav>

    <!-- Bottom Tab Navigation (Popular Game Pattern) -->
    <nav class="bottom-tabs" data-ref="bottomTabs">
      <button class="tab-item" data-ui data-action="open-rank"><span class="tab-icon"><svg viewBox="0 0 24 24" class="ti"><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="5" x2="17" y2="17"/><line x1="19" y1="5" x2="7" y2="17"/><line x1="15.5" y1="18.5" x2="18.5" y2="15.5"/><line x1="5.5" y1="15.5" x2="8.5" y2="18.5"/></g></svg></span><span class="tab-label">Rank</span></button>
      <button class="tab-item" data-ui data-action="open-shop"><span class="tab-icon"><svg viewBox="0 0 24 24" class="ti"><path d="M6 8h12l-1.2 12H7.2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="2"/></svg></span><span class="tab-label">Shop</span></button>
      <button class="tab-fly" data-ui data-action="pvp-practice" aria-label="Fly now"><span class="fly-disc"><svg viewBox="0 0 24 24" class="fi"><circle cx="12" cy="11" r="4.2" fill="currentColor"/><g stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="12" y1="2.5" x2="12" y2="5"/><line x1="12" y1="17" x2="12" y2="19.5"/><line x1="3.5" y1="11" x2="6" y2="11"/><line x1="18" y1="11" x2="20.5" y2="11"/><line x1="5.9" y1="4.9" x2="7.7" y2="6.7"/><line x1="16.3" y1="15.3" x2="18.1" y2="17.1"/><line x1="18.1" y1="4.9" x2="16.3" y2="6.7"/><line x1="7.7" y1="15.3" x2="5.9" y2="17.1"/></g></svg></span><span class="tab-label fly-label">Fly</span></button>
      <button class="tab-item" data-ui data-action="open-pass"><span class="tab-icon"><svg viewBox="0 0 24 24" class="ti"><path d="M4 9a2 2 0 0 0 0 6v3h16v-3a2 2 0 0 1 0-6V6H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><line x1="14" y1="6" x2="14" y2="18" stroke="currentColor" stroke-width="2" stroke-dasharray="2 2.4"/></svg></span><span class="tab-label">Pass</span></button>
      <button class="tab-item" data-ui data-action="open-settings"><span class="tab-icon"><svg viewBox="0 0 24 24" class="ti"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span><span class="tab-label">More</span></button>
    </nav>

    ${
      !portal && s.vipExpiredNotice
        ? `<div class="expire-strip">♛ VIP has lapsed — the Aurora bird stays yours, perks are paused.
             <button class="mini-btn vip" data-ui data-action="vip-buy">Renew ${s.vipPrice}</button>
             <button class="mini-btn ghost" data-ui data-action="vip-dismiss">Later</button></div>`
        : ""
    }

    <div class="wallet-row">
      <span class="pill coin">● ${s.wallet}</span>
      <span class="pill">🔥 ${s.streakDays}-day streak</span>
      <span class="pill">Nest Lv.${s.nestLevel} · ×${s.nestMult.toFixed(2)}</span>
       ${!portal && s.gold ? '<span class="pill gold">✦ Gold</span>' : ""}
       ${!portal && s.vip ? '<span class="pill vip">♛ VIP</span>' : ""}
      <span class="pill skill">${s.skillLabel}</span>
    </div>

    ${renderGoalList(s.sessionGoals)}
    ${renderQuests(s.quests)}
    ${renderMissions(s.missions)}
    <div class="menu-stats"><div>Best <b>${formatDistance(s.bestDistance)}</b></div><div>Today <b>${formatDistance(s.todayBest)}</b></div></div>
  `;
}

function skinRarity(d: { goldOnly?: boolean; vipOnly?: boolean; prizeOnly?: string; price: number; rarity?: string }): { key: string; label: string } {
  if (d.prizeOnly) return { key: "prize", label: "PRIZE" };
  // Explicit rarity from the catalogue wins over inferred price bands.
  if (d.rarity && d.rarity !== "starter") return { key: d.rarity, label: d.rarity.toUpperCase() };
  if (d.vipOnly) return { key: "mythic", label: "MYTHIC" };
  if (d.goldOnly) return { key: "legendary", label: "LEGENDARY" };
  if (d.price >= 700) return { key: "epic", label: "EPIC" };
  if (d.price >= 400) return { key: "rare", label: "RARE" };
  if (d.price > 0) return { key: "common", label: "COMMON" };
  return { key: "starter", label: "STARTER" };
}

function skinStatBars(d: { speedMult: number; feverBonus: number; daylightBonus: number; magnetAlways: boolean }): string {
  const bars: [string, number, string][] = [
    ["SPD", Math.min(100, Math.round(((d.speedMult - 1) / 0.08) * 100)), `${d.speedMult > 1 ? "+" : ""}${Math.round((d.speedMult - 1) * 100)}%`],
    ["FVR", Math.min(100, Math.round((d.feverBonus / 5) * 100)), d.feverBonus > 0 ? `+${d.feverBonus}s` : "—"],
    ["SUN", Math.min(100, Math.round((d.daylightBonus / 12) * 100)), d.daylightBonus > 0 ? `+${d.daylightBonus}s` : "—"],
  ];
  return `<div class="sk-stats">${bars
    .map(([k, pct, val]) => `<span class="sk-stat"><em>${k}</em><i><b style="width:${pct}%"></b></i><u>${val}</u></span>`)
    .join("")}${d.magnetAlways ? `<span class="sk-stat mag">🧲 always-on</span>` : ""}</div>`;
}

/** Group the 60+ bird wall into browsable collections with owned counters. */
function renderSkinCollections(s: HudSnapshot): string {
  const portal = s.portalName !== "none";
  const byId = new Map<string, SkinView[]>();
  for (const v of s.skins) {
    const cid = v.def.collection ?? "starter";
    if (!byId.has(cid)) byId.set(cid, []);
    byId.get(cid)!.push(v);
  }
  return COLLECTIONS.filter((c) => byId.has(c.id))
    .map((c) => {
      const skins = byId.get(c.id)!;
      const got = skins.filter((v) => v.owned).length;
      const complete = got === skins.length;
      const bonus = 100 + skins.length * 25;
      return `<div class="collection ${complete ? "complete" : ""}">
        <div class="coll-head"><span class="coll-icon">${c.icon}</span><b>${c.name}</b>
        <span class="coll-count">${complete ? "✓ complete" : `${got}/${skins.length} · set bonus ● ${bonus}`}</span></div>
        <div class="skin-grid">${skins.map((v) => renderSkinCard(v, portal)).join("")}</div>
      </div>`;
    })
    .join("");
}

function renderSkinCard(v: SkinView, portal = false): string {
  const d = v.def;
  const rarity = skinRarity(d);
  const swatch = `<div class="bird-swatch" style="--body:${hex(d.body)};--wing:${hex(d.wing)};--belly:${hex(d.belly)}"><i class="w"></i><i class="b"></i><i class="e"></i></div>`;
  let action: string;
  if (v.equipped) action = `<span class="tag on">✓ In use</span>`;
  else if (v.owned) action = `<button class="mini-btn" data-ui data-action="equip-skin" data-id="${d.id}">Equip</button>`;
  else if (d.prizeOnly) action = `<span class="tag prize" title="${d.prizeOnly}">🏆 ${d.prizeOnly}</span>`;
  else if (v.locked && portal)
    action = `<span class="tag portal-lock">Portal event</span>`;
  else if (v.locked)
    action = `<button class="mini-btn ${v.lockReason === "vip" ? "vip" : "gold"}" data-ui data-action="open-paywall">${v.lockReason === "vip" ? "♛ VIP" : "✦ Gold"}</button>`;
  else
    action = `<button class="mini-btn ${v.affordable ? "" : "off"}" data-ui data-action="buy-skin" data-id="${d.id}">● ${d.price}</button>`;
  return `<div class="skin-card r-${rarity.key} ${v.equipped ? "equipped" : ""} ${v.owned ? "owned" : ""}">
    <span class="rarity">${rarity.label}</span>${swatch}
    <div class="sk-name">${d.name}</div><div class="sk-perk">${d.perk}</div>${skinStatBars(d)}${action}</div>`;
}

function renderRivalBanner(banner: string): string {
  const [name, dist] = banner.split("|");
  return `<div class="rival-banner">🥊 <b>${escapeHtml(name)}</b> challenged you — beat <b>${escapeHtml(dist)} m</b> on their hills. Hold to fly.</div>`;
}

function renderBoostRow(v: BoostView, wallet: number): string {
  const d = v.def;
  const price = v.dealPrice ?? d.price;
  const missing = Math.max(0, price - wallet);
  const priceLabel = v.dealPrice !== undefined ? `<s>● ${d.price}</s> ● ${price}` : `● ${price}`;
  const action = v.armed
    ? `<span class="tag on">Armed ✓</span>`
    : v.affordable
      ? `<button class="mini-btn ${v.dealPrice !== undefined ? "gold" : ""}" data-ui data-action="buy-boost" data-id="${d.id}">${priceLabel}</button>`
      : `<span class="tag need">Need ${missing}●</span>`;
  const dealTag = v.dealPrice !== undefined && !v.armed ? `<span class="deal-tag">TODAY −50%</span>` : "";
  return `<div class="boost-row ${v.armed ? "armed" : ""} ${v.dealPrice !== undefined ? "deal" : ""}"><span class="bi">${d.icon}</span><div><div class="mt">${d.name}<span class="boost-once">one flight</span>${dealTag}</div><div class="md">${d.desc}</div></div>${action}</div>`;
}

function renderTrailCard(v: ShopTrailView, wallet: number): string {
  const d = v.def;
  const stops = d.css.join(", ");
  const missing = Math.max(0, d.price - wallet);
  const action = v.equipped
    ? `<span class="tag on">✓ In use</span>`
    : v.owned
      ? `<button class="mini-btn" data-ui data-action="buy-trail" data-id="${d.id}">Equip</button>`
      : v.affordable
        ? `<button class="mini-btn" data-ui data-action="buy-trail" data-id="${d.id}">● ${d.price}</button>`
        : `<span class="tag need">Need ${missing}●</span>`;
  return `<div class="trail-card ${v.equipped ? "equipped" : ""}">
    <span class="trail-swatch" style="background:linear-gradient(90deg, ${stops})"></span>
    <div class="trail-body"><b>${d.label}</b><em>${d.desc}</em></div>${action}</div>`;
}

function renderShop(s: HudSnapshot): string {
  const owned = s.skins.filter((v) => v.owned).length;
  const armed = s.boosts.filter((v) => v.armed).length;
  return `
    ${head("Shop", "back", `<span class="pill coin">● ${s.wallet}</span>`)}
    <p class="tagline">Birds change how you fly. Boosts arm for exactly one flight — spend them where they count.</p>
    <div class="section-title">Birds <small>${owned}/${s.skins.length} owned</small></div>
    ${renderSkinCollections(s)}
    <div class="section-title">Boosts <small>${armed} armed for your next flight</small></div>
    <div class="boost-list">${s.boosts.map((b) => renderBoostRow(b, s.wallet)).join("")}</div>
    <div class="section-title">Nest <small>permanent score multiplier</small></div>
    <div class="boost-list"><div class="boost-row nest-row">
      <span class="bi">☀️</span>
      <div><div class="mt">Nest upgrade <span class="boost-once">forever</span></div>
      <div class="md">Lv.${s.nestLevel} · ×${s.nestMult.toFixed(2)} score${s.nestMaxed ? " · fully upgraded" : ` · next ×${(s.nestMult + 0.12).toFixed(2)}`}</div></div>
      ${
        s.nestMaxed
          ? `<span class="tag on">MAX ✓</span>`
          : s.wallet >= s.nestPrice
            ? `<button class="mini-btn gold" data-ui data-action="buy-nest">● ${s.nestPrice}</button>`
            : `<span class="tag need">Need ${s.nestPrice - s.wallet}●</span>`
      }
    </div></div>
    <div class="section-title">Trails <small>cosmetic — yours forever</small></div>
    <div class="trail-list">${s.shopTrails.map((t) => renderTrailCard(t, s.wallet)).join("")}</div>
    ${s.portalName === "none" && !(s.gold && s.vip) ? upsellStrip() : ""}
    <p class="fineprint">Earn coins by flying, daily quests, streaks and the Nest Pass.</p>
  `;
}

function renderPaywall(s: HudSnapshot): string {
  if (s.portalName !== "none") {
    return `
      ${head("Portal Edition")}
      <div class="portal-card">
        <div class="logo-mark">✦</div>
        <h2>Play Fair. Fly Far.</h2>
        <p class="tagline">This portal edition has no direct checkout, no external ads, no paywall.${s.portalName === "poki" || s.portalName === "crazy" ? " Rewards come from the portal." : ""}</p>
        <p class="fineprint">Keep your momentum, complete missions, and earn every cosmetic through play.</p>
      </div>
    `;
  }
  const stripeGold = s.checkoutMode === "stripe";
  const starter = !s.starterOwned
    ? `
    <div class="starter-card">
      <div class="starter-flag">ONE-TIME OFFER</div>
      <h3>🎁 First Flight Pack · ${s.starterPrice}</h3>
      <ul class="feature-list tight">${s.starterFeatures.map((f) => `<li>${f}</li>`).join("")}</ul>
      <button class="primary-btn starter" data-ui data-action="starter-buy">Claim the pack · ${s.starterPrice}</button>
    </div>`
    : "";
  return `
    ${head("Gold &amp; VIP")}
    ${starter}
    <div class="gold-hero"><div class="gold-badge">✦</div><div class="gold-price">${s.goldPrice}<small> one-time</small></div></div>
    <ul class="feature-list">${s.goldFeatures.map((f) => `<li>${f}</li>`).join("")}</ul>
    ${
      s.gold
        ? `<div class="owned-banner">You own Gold. Thank you, sunbird ✦</div>`
        : `<button class="primary-btn gold" data-ui data-action="gold-buy">Unlock Gold · ${s.goldPrice}</button>`
    }
      <div class="gold-hero vip"><div class="gold-badge vip">♛</div><div class="gold-price">${s.vipPrice}<small> per month</small></div></div>
    <ul class="feature-list">${s.vipFeatures.map((f) => `<li>${f}</li>`).join("")}</ul>
    ${
      s.vip
        ? `<div class="owned-banner vip">VIP active — ${s.vipDaysLeft} day${s.vipDaysLeft === 1 ? "" : "s"} left${
            s.vipDaysLeft <= 5 ? " · renew soon to keep the perks" : ""
          }</div><button class="soft-btn wide vip" data-ui data-action="vip-buy">Extend by 30 days · ${s.vipPrice}</button>`
        : `<button class="primary-btn vip" data-ui data-action="vip-buy">Subscribe · ${s.vipPrice}</button>`
    }
    <div class="redeem"><input data-ui data-ref="redeem" placeholder="Promo code" maxlength="16" autocomplete="off" /><button class="mini-btn" data-ui data-action="redeem">Redeem</button></div>
    <button class="ghost-btn" data-ui data-action="restore">Restore purchase</button>
    ${s.restoreMessage ? `<p class="note">${s.restoreMessage}</p>` : ""}
    <p class="fineprint">${stripeGold ? "Payments are processed securely by Stripe." : "Unlock premium features to enhance your flights!"}</p>
  `;
}

function renderCheckout(s: HudSnapshot): string {
  if (s.checkoutOk) {
    const okLabel = s.checkoutSku === "sunbird_vip" ? "VIP" : s.checkoutSku === "sunbird_starter" ? "ready for takeoff" : "Gold";
    return `<div class="check-ok"><div class="gold-badge big">${s.checkoutSku === "sunbird_vip" ? "♛" : s.checkoutSku === "sunbird_starter" ? "🎁" : "✦"}</div><h2>You're ${okLabel}!</h2><p class="tagline">Your perks are active immediately</p><button class="primary-btn gold" data-ui data-action="back">Fly on</button></div>`;
  }
  const item =
    s.checkoutSku === "sunbird_vip"
      ? { name: "Sunbird VIP · monthly", price: s.vipPrice }
      : s.checkoutSku === "sunbird_starter"
        ? { name: "First Flight Pack · one-time", price: s.starterPrice }
        : { name: "Sunbird Gold · lifetime", price: s.goldPrice };
  if (s.checkoutMode === "stripe") {
    return `
      ${head("Stripe Checkout", "checkout-cancel")}
      <div class="sheet stripe">
        <div class="sheet-row"><span>${item.name}</span><b>${item.price}</b></div>
        <p class="tagline">You'll continue to Stripe's secure checkout in a new tab.</p>
        <button class="primary-btn gold" data-ui data-action="stripe-open">Continue to Stripe ↗</button>
        ${
          s.checkoutWaiting
            ? `<div class="stripe-wait"><div class="spinner"></div><p>Finished paying?</p><button class="mini-btn" data-ui data-action="stripe-confirm">I've completed payment</button></div>`
            : ""
        }
        <p class="fineprint">Stripe-hosted Payment Link · card, wallet &amp; local payment methods supported.</p>
      </div>
    `;
  }
  return `
    ${head("Demo Checkout", "checkout-cancel")}
    <div class="sheet">
      <div class="sheet-row"><span>${item.name}</span><b>${item.price}</b></div>
      <label>Card number<input data-ui value="4242 4242 4242 4242" readonly /></label>
      <div class="two"><label>Expiry<input data-ui value="12 / 29" readonly /></label><label>CVC<input data-ui value="123" readonly /></label></div>
      <label>Name on card<input data-ui value="Sunbird Tester" readonly /></label>
      ${s.checkoutError ? `<p class="error">${escapeHtml(s.checkoutError)}</p>` : ""}
      <button class="primary-btn gold ${s.checkoutBusy ? "busy" : ""}" data-ui data-action="checkout-pay" ${s.checkoutBusy ? "disabled" : ""}>${s.checkoutBusy ? "Processing…" : `Pay ${item.price}`}</button>
      <p class="fineprint">Sandbox card · no real charge. Connect Stripe in .env to go live.</p>
    </div>
  `;
}

function renderSettings(s: HudSnapshot): string {
  const toggle = (label: string, key: string, on: boolean): string =>
    `<div class="setting-row"><span>${label}</span><button class="toggle ${on ? "on" : ""}" data-ui data-action="set-${key}" aria-pressed="${on}" aria-label="${label}"><i></i></button></div>`;
  const mPct = Math.round((s.settings.musicVolume ?? 0.8) * 100);
  const sPct = Math.round((s.settings.sfxVolume ?? 0.9) * 100);
  return `
    ${head("Settings")}
    ${toggle("Sound Effects", "mute", !s.settings.mute)}
    <div class="setting-row"><span>SFX Volume</span><button class="mini-btn" data-ui data-action="set-sfx-vol">${s.settings.mute ? "Muted" : `${sPct}%`}</button></div>
    ${toggle("Music", "music", s.settings.music)}
    <div class="setting-row"><span>Music Volume</span><button class="mini-btn" data-ui data-action="set-music-vol">${!s.settings.music ? "Off" : `${mPct}%`}</button></div>
    ${toggle("Haptics", "haptics", s.settings.haptics)}
    ${toggle("Reduce motion", "motion", s.settings.reduceMotion)}
    ${toggle("Colorblind assist", "colorassist", s.settings.colorAssist)}
    ${toggle("Large text", "bigtext", s.settings.bigText)}
    <div class="setting-row"><span>Render quality</span><button class="mini-btn" data-ui data-action="set-quality">${s.settings.quality.toUpperCase()}</button></div>
    <div class="setting-row"><span>Flights flown</span><b>${s.runsPlayed}</b></div>
    ${s.canInstall ? `<button class="soft-btn wide" data-ui data-action="install-app">⬇ Install Sunbird</button>` : ""}
    <button class="ghost-btn danger" data-ui data-action="reset-progress">${s.resetArmed ? "Tap again to erase everything" : "Reset progress"}</button>
    <p class="fineprint">Sunbird 2.5 Pro · ${s.seedLabel}</p>
  `;
}

function renderScores(s: HudSnapshot): string {
  return `
    ${head("High glides")}
    ${renderScoreTable(s.highScores)}
    <div class="menu-stats"><div>Today's best <b>${formatDistance(s.todayBest)}</b></div><div>Flights <b>${s.runsPlayed}</b></div></div>
  `;
}

function rewardLabel(r: { kind: string; amount?: number; id?: string }): string {
  if (r.kind === "coins") return `● ${r.amount}`;
  if (r.kind === "skin") return `🐦 ${r.id}`;
  if (r.kind === "trail") return `✨ ${r.id?.replace("trail_", "") ?? "trail"}`;
  return `🎁 ${r.id}`;
}

function renderPass(s: HudSnapshot): string {
  const pct = Math.min(100, (s.season.have / s.season.need) * 100);
  return `
    ${head("Nest Pass", "back", `<span class="pill">Lv.${s.season.tier}/${s.season.maxTier}</span>`)}
    <div class="pass-progress"><i style="width:${pct}%"></i></div>
    <p class="tagline">${s.season.label} — fly to earn XP. Gold unlocks the premium track.</p>
    ${!s.gold ? `<button class="upsell" data-ui data-action="open-paywall"><div><b>✦ Unlock premium rewards</b><span>Double the tier rewards with Gold</span></div><span class="mini-btn gold">Unlock</span></button>` : ""}
    <div class="tier-track">
      ${s.season.tiers
        .map((t) => {
          const canFree = t.unlocked && !t.freeClaimed;
          const canPremium = t.unlocked && !t.premiumLocked && !t.premiumClaimed;
          return `<div class="tier-card ${t.unlocked ? "unlocked" : ""}">
            <div class="tier-num">Lv.${t.tier}</div>
            <button class="tier-reward free ${t.freeClaimed ? "claimed" : ""}" data-ui data-action="${canFree ? "claim-pass-free" : ""}" data-id="${t.tier}" ${canFree ? "" : "disabled"}>${rewardLabel(t.free)}</button>
            <button class="tier-reward premium ${t.premiumClaimed ? "claimed" : ""} ${t.premiumLocked ? "locked" : ""}" data-ui data-action="${canPremium ? "claim-pass-premium" : ""}" data-id="${t.tier}" ${canPremium ? "" : "disabled"}>${rewardLabel(t.premium)}${t.premiumLocked ? `<i class="lock-badge">✦</i>` : ""}</button>
          </div>`;
        })
        .join("")}
    </div>
    <p class="fineprint">The Nest Pass resets every month — spend rewards before it does!</p>
  `;
}

function renderTrophies(s: HudSnapshot): string {
  const groups: Record<string, AchievementView[]> = { bronze: [], silver: [], gold: [], platinum: [] };
  for (const v of s.trophies) groups[v.def.rarity]!.push(v);
  const order: (keyof typeof groups)[] = ["bronze", "silver", "gold", "platinum"];
  return `
    ${head("Trophy Case", "back", `<span class="pill">${s.trophyCounts.unlocked}/${s.trophyCounts.total}</span>`)}
    ${order
      .map(
        (rarity) => `
      <div class="section-title">${rarity}</div>
      <div class="trophy-grid">
        ${groups[rarity]!
          .map((v) => {
            const pct = Math.min(100, (v.progress / v.def.target) * 100);
            return `<div class="trophy ${v.unlocked ? "unlocked" : ""} ${rarity}">
              <div class="trophy-icon">${v.unlocked ? "🏆" : "🔒"}</div>
              <div class="trophy-name">${v.def.title}</div>
              <div class="trophy-desc">${v.def.desc}</div>
              ${v.unlocked ? "" : `<div class="qb"><i style="width:${pct}%"></i></div>`}
            </div>`;
          })
          .join("")}
      </div>`,
      )
      .join("")}
  `;
}

function renderAccount(s: HudSnapshot): string {
  return `
    ${head("Account")}
    <div class="section-title">Membership</div>
    <div class="sheet">
      <div class="code-row"><span>${s.gold ? "✦ Gold · owned for life" : "✦ Gold · not owned"}</span>${
        s.gold ? `<span class="tag on">Active</span>` : `<button class="mini-btn gold" data-ui data-action="open-paywall">Get Gold</button>`
      }</div>
      <div class="code-row"><span>♛ VIP · ${s.vip ? `${s.vipDaysLeft} day${s.vipDaysLeft === 1 ? "" : "s"} left` : "inactive"}</span>${
        s.vip
          ? `<button class="mini-btn vip" data-ui data-action="vip-buy">Extend</button>`
          : `<button class="mini-btn vip" data-ui data-action="vip-buy">Subscribe</button>`
      }</div>
      <p class="fineprint">VIP gifts ${VIP_DAILY_GIFT} coins every day you play and adds a fourth daily quest. ${
        s.vip ? "" : "Cancel anytime — no auto-renewal in this build; your 30 days simply run out."
      } Sponsored breaks respect a hard cap: <b>${s.adsLeftToday}</b> left today.</p>
    </div>
    <div class="section-title">Invite friends</div>
    <div class="sheet">
      <p class="tagline">Share your code — friends who redeem it get a welcome bonus on their device.</p>
      <div class="code-row"><span class="code">${s.referralCode}</span><button class="mini-btn" data-ui data-action="copy-referral">Copy</button></div>
      ${
        s.referralRedeemed
          ? `<p class="note">You've already redeemed a friend code. Thanks for joining!</p>`
          : `<div class="redeem"><input data-ui data-ref="friendcode" placeholder="Friend's code (SUN-XXXXXX)" maxlength="10" autocomplete="off" /><button class="mini-btn" data-ui data-action="redeem-referral">Apply</button></div>`
      }
      ${s.referralMessage ? `<p class="note">${s.referralMessage}</p>` : ""}
    </div>
    <div class="section-title">Cloud save</div>
    <div class="sheet">
      <p class="tagline">Copy this code to move your progress to another device.</p>
      <textarea class="cloud-box" data-ui data-ref="cloudExport" readonly rows="3">${s.cloudCode}</textarea>
      <button class="mini-btn" data-ui data-action="copy-cloud">Copy code</button>
      <p class="tagline" style="margin-top:10px">Paste a code from another device to restore it here:</p>
      <textarea class="cloud-box" data-ui data-ref="cloudImport" rows="3" placeholder="Paste save code…"></textarea>
      <button class="mini-btn" data-ui data-action="import-cloud">Import</button>
      ${s.cloudMessage ? `<p class="note">${s.cloudMessage}</p>` : ""}
    </div>
    <p class="fineprint">Copy your save code to transfer progress between devices.</p>
  `;
}

function renderGoalList(goals: SessionGoal[]): string {
  if (!goals.length) return "";
  return `<div class="quests"><div class="mission-head">Session goals</div>${goals
    .map((g) => {
      const pct = Math.min(100, (g.progress / g.target) * 100);
      return `<div class="quest ${g.done ? "done" : ""}">
        <div><div class="mt">${g.label}</div><div class="qb"><i style="width:${pct}%"></i></div></div>
        <span class="qr">● ${g.reward}</span>
      </div>`;
    })
    .join("")}</div>`;
}

function renderGameOver(s: HudSnapshot): string {
  if (s.versus && s.p1Stats && s.p2Stats) return renderVersusResult(s);
  const questTotal = s.claimedQuests.reduce((a, q) => a + q.reward, 0);
  const deltaTxt =
    s.raceRated && s.ratingDelta !== 0
      ? `<span class="rate-delta ${s.ratingDelta > 0 ? "up" : "down"}">${s.ratingDelta > 0 ? "+" : ""}${s.ratingDelta}</span>`
      : "";
  const duelStrip =
    s.duelWas !== ""
      ? `<div class="race-hero ${s.duelWas === "won" ? "win" : ""}">
           <div class="race-medal">${s.duelWas === "won" ? "⚔🥇" : "⚔"}</div>
           <div class="race-place"><b>DUEL ${s.duelWas === "won" ? "WON" : "LOST"}</b><span>${s.duelWas === "won" ? "+" : ""}${s.duelDelta} rating → ${s.rival.rating}</span></div>
           <div class="race-rating">Duel record ${s.duel.wins}–${s.duel.losses} · 🔥${s.duel.streak} streak<span class="race-rated-tag">ranked · local</span></div>
         </div>
         <button class="primary-btn race40 hero" data-ui data-action="pvp-duel"><span class="hero-label">⚔ REMATCH</span><span class="hero-hint">same rating band, fresh wings</span></button>`
      : "";
  const raceStrip =
    s.duelWas === "" && s.massRace && s.racePlace > 0
      ? `<div class="race-hero ${s.racePlace === 1 ? "win" : s.racePlace <= 3 ? "podium" : ""}">
           <div class="race-medal">${s.racePlace === 1 ? "🥇" : s.racePlace === 2 ? "🥈" : s.racePlace === 3 ? "🥉" : "🏁"}</div>
           <div class="race-place"><b>P${s.racePlace}</b><span>of ${s.raceField} pilots · ${s.raceFinishTime.toFixed(1)}s</span></div>
           ${s.raceVerified ? `<div class="verified-tag">✓ placement refereed by the room server</div>` : ""}
           <div class="race-bar"><i style="width:${Math.round((1 - (s.racePlace - 1) / Math.max(1, s.raceField)) * 100)}%"></i></div>
           ${
             s.raceRated
               ? `<div class="race-rating">Rival rating ${s.rival.rating} ${deltaTxt}<span class="race-rated-tag">ranked · local</span></div>`
               : `<div class="race-rating"><span class="race-rated-tag">casual · rating frozen</span></div>`
           }
           ${
             s.rival.streak >= 2
               ? `<div class="race-streak">🔥 ${s.rival.streak}-race win streak${s.ratingBonus > 0 ? ` · +${s.ratingBonus}● streak bonus` : ""}</div>`
               : ""
           }
         </div>
         ${s.photoFinish ? `<div class="reward-strip photo">📸 ${escapeHtml(s.photoFinish)}</div>` : ""}
         <button class="primary-btn race40 hero" data-ui data-action="${s.raceRated ? "pvp-ranked" : "pvp-casual"}"><span class="hero-label">🔁 REMATCH</span><span class="hero-hint">${s.nemesis ? `settle it with ${escapeHtml(s.nemesis)}` : "same field · same hills"}</span></button>
         <button class="soft-btn wide" data-ui data-action="open-live">Find new match</button>`
      : "";
  return `
    <div class="zzz">z z z</div>
    <h2>Sunbird sleeps</h2>
    <p class="tagline">The daylight ran out.</p>
    <div class="over-stats">
      <div><span>Distance</span><b>${formatDistance(s.distance)}</b></div>
      <div><span>Score</span><b>${Math.floor(s.score).toLocaleString()}</b></div>
      <div><span>Coins</span><b>${s.coins}</b></div>
      <div><span>Perfects</span><b>${s.perfects}</b></div>
      <div><span>Zeniths</span><b>${s.zeniths}</b></div>
      <div><span>Rings</span><b>${s.rings}</b></div>
      <div><span>Balloons</span><b>${s.balloons}</b></div>
      <div><span>Islands</span><b>${s.island + 1}</b></div>
    </div>
    ${s.ghostDelta !== null ? `<div class="reward-strip ${s.ghostDelta >= 0 ? "" : "nest"}">${s.ghostDelta >= 0 ? `Beat your ghost by ${Math.round(s.ghostDelta)}m! 👻` : `${Math.round(-s.ghostDelta)}m behind your best ghost`}</div>` : ""}
    ${questTotal ? `<div class="reward-strip">Daily quest${s.claimedQuests.length > 1 ? "s" : ""} complete · +${questTotal} coins</div>` : ""}
    ${s.newlyCompleted.length ? `<div class="reward-strip nest">Nest upgraded → Lv.${s.nestLevel} · ×${s.nestMult.toFixed(2)} score</div>` : ""}
    ${s.nearMiss ? `<div class="nearmiss">${s.nearMiss}</div>` : ""}
    ${s.challengeOutcome ? `<div class="reward-strip ${s.challengeOutcome.includes("missed") ? "nest" : ""}">${escapeHtml(s.challengeOutcome)}</div>` : ""}
    ${duelStrip}
    ${raceStrip}
    <div class="reached-strip">Reached <b>${s.biomeEmoji} ${s.biomeName}</b> · Island ${s.island + 1}</div>
    <button class="play-again-btn" data-ui data-action="retry">✈ FLY AGAIN</button>
    ${s.massRace && s.racePlace > 0 ? `<button class="soft-btn wide rematch" data-ui data-action="rematch">🔁 Rematch — same stakes</button>` : ""}
    <button class="soft-btn wide" data-ui data-action="throw-challenge">🥊 Challenge a rival on these hills</button>
    <button class="soft-btn wide" data-ui data-action="share" ${s.shareBusy ? "disabled" : ""}>${s.shareBusy ? "Preparing…" : "📤 Share this flight"}</button>
    <div class="btn-row">
      <button class="soft-btn" data-ui data-action="open-shop">🛍 Shop</button>
      <button class="soft-btn" data-ui data-action="open-pass">🎟 Pass</button>
      <button class="soft-btn" data-ui data-action="open-atlas">🗺 Atlas</button>
      <button class="soft-btn" data-ui data-action="menu">Menu</button>
    </div>
    ${s.portalName === "none" && !(s.gold && s.vip) ? upsellStrip() : ""}
    ${renderGoalList(s.sessionGoals)}
    ${renderQuests(s.quests)}
    ${renderMissions(s.missions, s.newlyCompleted)}
    <h3 class="table-title">High glides</h3>
    ${renderScoreTable(s.highScores.slice(0, 5))}
  `;
}

function renderContinue(s: HudSnapshot): string {
  const portal = s.portalName !== "none";
  return `
    <div class="zzz">z z z</div>
    <h2>Second wind?</h2>
    <p class="tagline">Sunbird is dozing off at ${formatDistance(s.distance)}.</p>
    <div class="count-ring" data-live="contTimer">${Math.ceil(s.continueTimer)}</div>
    ${!portal && s.gold ? `<button class="primary-btn gold" data-ui data-action="continue-gold">✦ Gold · free wake-up</button>` : ""}
    <button class="primary-btn ${s.canAffordContinue ? "" : "off"}" data-ui data-action="continue-coins" ${s.canAffordContinue ? "" : "disabled"}>Spend ● ${s.continueCost} <small>(you have ${s.wallet})</small></button>
    ${s.adAvailable ? `<button class="soft-btn wide" data-ui data-action="continue-ad">▶ ${portal ? "Watch for Second Wind" : "Watch a short break"}</button>` : ""}
    <button class="ghost-btn" data-ui data-action="continue-sleep">Let it sleep</button>
  `;
}

function renderAd(s: HudSnapshot): string {
  if (s.portalName !== "none") {
    return `
      <div class="ad-label">${s.portalName === "poki" ? "Poki" : s.portalName === "crazy" ? "CrazyGames" : "Portal"} break</div>
      <div class="portal-ad-wait"><div class="spinner"></div><h3>Preparing the next flight</h3><p>Your run is paused while the portal handles this break.</p></div>
    `;
  }
  return `
    <div class="ad-label">Sponsored break · ${s.adReason === "continue" ? "earning your second wind" : "between flights"}</div>
    <div class="ad-creative">
      <div class="ad-logo">☀️</div>
      <h3>Nest Deluxe</h3>
      <p>Sleep deeper. Fly farther. The premium nest for discerning sunbirds.</p>
      <span class="ad-cta">Learn more</span>
    </div>
    <div class="ad-bar"><i data-live="adBar"></i></div>
    <div class="ad-actions">
      <button class="mini-btn" data-ui data-action="ad-skip" data-live="adSkip" disabled>Skip in ${Math.ceil(s.adTimer)}</button>
      ${s.gold ? "" : `<button class="mini-btn gold" data-ui data-action="ad-gold">✦ Remove breaks</button>`}
    </div>
  `;
}
