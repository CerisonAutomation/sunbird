import type { AchievementView } from "./Achievements";
import type { ActivePower } from "./PowerUps";
import type { GlobalEntry } from "./GlobalLeaderboard";
import type { SessionGoal } from "./Engagement";
import type { ModeDef } from "./Modes";
import type { RacerStats } from "./Racer";
import { VIP_DAILY_GIFT } from "./constants";
import type { BoostView, SkinView } from "./Economy";
import { formatDistance } from "./math";
import type { MissionView, QuestReward, QuestView } from "./Missions";
import type { HighScore, Settings } from "./SaveData";
import type { TierView } from "./SeasonPass";
import type { DailyChallengeResult } from "./DailyChallenge";
import type { WeeklyTournamentResult } from "./WeeklyTournament";

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
  | "multiplayer"
  | "stats";

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

export type HudSnapshot = {
  state: UiState;
  screen: UiScreen;
  checkoutSku: "sunbird_gold" | "sunbird_vip";
  version: number;
  distance: number;
  coins: number;
  daylight: number;
  daylightMax: number;
  fever: number;
  feverOn: boolean;
  multiplier: number;
  bestDistance: number;
  isNewBest: boolean;
  score: number;
  island: number;
  perfects: number;
  clouds: number;
  zeniths: number;
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
  seedMode: SeedMode;
  wallet: number;
  streakDays: number;
  nestLevel: number;
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
  settings: Settings;
  goldPrice: string;
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
  globalLbRank: number;
  globalLbTotal: number;
  globalLbTop: GlobalEntry[];
  platform: "poki" | "crazy" | "none";
  /* --- rewarded ad placements --- */
  doubleCoinsAvailable: boolean;
  doubleCoinsEarned: boolean;
  doubleCoinsUsed: boolean;
  skinTrialAvailable: boolean;
  skinTrialActive: boolean;
  bonusQuestAvailable: boolean;
  bonusQuestEarned: boolean;
  bonusQuestLabel: string;
  headstartAdAvailable: boolean;
  headstartAdUsed: boolean;
  gemMultAvailable: boolean;
  gemMultActive: boolean;
  streakSaveAvailable: boolean;
  streakBroken: boolean;
  shieldRefillAvailable: boolean;
  shieldRefillUsed: boolean;
  platformReady: boolean;
  /* --- notifications --- */
  notifSupported: boolean;
  notifSubscribed: boolean;
  /* --- voice control --- */
  voiceEnabled: boolean;
  voiceSupported: boolean;
  ttsEnabled: boolean;
  /* --- online multiplayer --- */
  multiplayerAvailable: boolean;
  mpState: "idle" | "connecting" | "lobby" | "racing" | "results";
  mpRoomCode: string;
  mpPlayers: { name: string; color: number; ready: boolean; distance: number; alive: boolean; rank: number }[];
  mpChat: { from: string; msg: string }[];
  mpIsHost: boolean;
  mpConnected: boolean;
  selectedColor: string;
  /* --- profile --- */
  totalFlights: number;
  totalDistance: number;
  totalCoins: number;
  seasonDaysLeft: number;
  seasonProgress: number;
  achievementShowcase: AchievementView[];
  streakDaysCount: number;
  /* --- challenge --- */
  challengeFrom: string;
  challengeScore: number;
  challengeActive: boolean;
  /* --- daily challenge / weekly tournament --- */
  dailyResult: DailyChallengeResult | null;
  weeklyResult: WeeklyTournamentResult | null;
  dailyPlayed: boolean;
  dailyTopScores: { score: number; distance: number }[];
  dailyTimeLeft: string;
  dailyLabel: string;
  weeklyPlayed: boolean;
  weeklyTopScores: { score: number; distance: number }[];
  weeklyTimeLeft: string;
  weeklyLabel: string;
  /* --- run statistics --- */
  lifetimePerfects: number;
  lifetimePlayTime: number;
  lifetimeBestCombo: number;
  lifetimeBiomeVisits: Record<string, number>;
  favoriteBiome: string;
  averageRunDistance: number;
  playerName: string;
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
  private sunCaption!: HTMLElement;
  private feverWrap!: HTMLElement;
  private feverFill!: HTMLElement;
  private hintEl!: HTMLElement;
  private menuEl!: HTMLElement;
  private menuCard!: HTMLElement;
  private auroraCanvas!: HTMLCanvasElement;
  private auroraRaf = 0;
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
  private gemMultBanner!: HTMLElement;
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
  private shieldRefillEl!: HTMLElement;
  private comboFloatLayer!: HTMLElement;
  private borderGlow!: HTMLElement;
  private voiceIndicator!: HTMLElement;
  private lastGoals = "";
  private lastGoalPop = "";
  private lastPowers = "";
  private lastBanner = "";
  private lastCountdown = "";
  private lastCombo = -1;
  private lastBiome = "";
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
          </div>
          <div class="sun-meter" title="Daylight">
            <div class="sun-track">
              <div class="sun-fill" data-ref="sunFill"></div>
              <div class="sun-knob" data-ref="sunKnob">☀</div>
            </div>
            <div class="sun-caption" data-ref="sunCaption">daylight</div>
          </div>
          <div class="stat-block right">
            <div class="stat-label">Coins</div>
            <div class="stat-value coin" data-ref="coins">0</div>
            <div class="stat-sub">best <span data-ref="best">0</span></div>
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
        <div class="mid-meta">
          <div class="island-chip" data-ref="island">Island 1</div>
          <div class="biome-chip" data-ref="biome"></div>
          <div class="mult-chip" data-ref="mult">×1.0</div>
          <div class="gold-chip hidden" data-ref="goldChip">✦ GOLD</div>
          <div class="vip-chip hidden" data-ref="vipChip">♛ VIP</div>
          <div class="ghost-chip hidden" data-ref="ghostChip"></div>
        </div>
        <div class="power-chips" data-ref="powers"></div>
        <div class="shield-refill-banner hidden" data-ref="shieldRefill">
          <button class="mini-btn ad-reward" data-ui data-action="ad-shield-refill">🎬 Watch ad · free shield 🛡</button>
        </div>
        <div class="fever-wrap" data-ref="feverWrap">
          <div class="fever-label">FEVER</div>
          <div class="fever-bar"><div class="fever-fill" data-ref="feverFill"></div></div>
        </div>
        <button class="icon-btn pause-btn" data-ui data-action="pause" aria-label="Pause">❙❙</button>
        <div class="voice-indicator hidden" data-ref="voiceIndicator">🎤</div>
        <div class="combo" data-ref="combo"></div>
        <div class="combo-float-layer" data-ref="comboFloatLayer"></div>
        <div class="border-glow" data-ref="borderGlow"></div>
        <div class="gem-mult-banner hidden" data-ref="gemMultBanner">
          <button class="mini-btn ad-reward" data-ui data-action="ad-gem-mult">🎬 Watch ad · 5× gem value 💎</button>
        </div>
        <div class="hint" data-ref="hint"></div>
        <div class="hand" data-ref="hand">☝</div>
      </div>

      <div class="overlay menu hidden" data-ref="menu">
        <canvas class="menu-aurora" data-ref="auroraCanvas"></canvas>
        <div class="glass-card" data-ref="menuCard"></div>
      </div>

      <div class="overlay pause hidden" data-ref="pause">
        <div class="glass-card slim">
          <h2>Paused</h2>
          <p class="tagline">The sun waits for no bird.</p>
          <button class="primary-btn" data-ui data-action="resume">Resume</button>
          <button class="ghost-btn" data-ui data-action="menu">Give up</button>
        </div>
      </div>

      <div class="overlay continue hidden" data-ref="continue"><div class="glass-card slim" data-ref="contCard"></div></div>
      <div class="overlay ad hidden" data-ref="ad"><div class="ad-card" data-ref="adCard"></div></div>
      <div class="overlay gameover hidden" data-ref="over"><div class="glass-card over-card" data-ref="overCard"></div></div>

      <div class="toasts" data-ref="toasts" aria-live="polite"></div>
      <div class="flash" data-ref="flash"></div>
    `;
    parent.appendChild(this.root);
    this.bind();
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
    const el = this.root.querySelector(`[data-ref="${ref}"]`) as HTMLInputElement | HTMLTextAreaElement | null;
    return el?.value ?? "";
  }

  update(s: HudSnapshot): void {
    const mpTick = s.mpState !== "idle" ? `|mp:${s.mpState}:${s.mpRoomCode}:${s.mpPlayers.length}:${s.mpChat.length}` : "";
    const key = `${s.state}|${s.screen}|${s.version}${mpTick}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.renderStatic(s);
    }

    const inPlay = s.state === "playing" || s.state === "paused" || s.state === "continue";
    this.playHud.classList.toggle("hidden", !inPlay);
    this.playHud.classList.toggle("versus", s.versus);
    const menuVisible = s.state === "menu" || (s.state === "gameover" && s.screen !== "main");
    this.menuEl.classList.toggle("hidden", !menuVisible);
    this.pauseEl.classList.toggle("hidden", s.state !== "paused");
    this.contEl.classList.toggle("hidden", s.state !== "continue");
    this.adEl.classList.toggle("hidden", s.state !== "ad");
    this.overEl.classList.toggle("hidden", !(s.state === "gameover" && s.screen === "main"));

    if (inPlay) {
      this.distanceEl.textContent = formatDistance(s.distance);
      this.coinsEl.textContent = String(s.coins);
      this.bestEl.textContent = formatDistance(s.bestDistance);
      this.islandEl.textContent = `Island ${s.island + 1}`;
      this.multEl.textContent = `×${s.multiplier.toFixed(1)}`;
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
      this.sunFill.style.width = `${Math.max(2, day * 100)}%`;
      this.sunKnob.style.left = `${day * 100}%`;
      this.sunFill.classList.toggle("low", day < 0.28);
      // Time Trial mode: show countdown timer instead of "daylight" label
      if (s.modeId === "timetrial" && s.daylightMax > 0) {
        this.sunCaption.textContent = `${Math.ceil(s.daylight)}s`;
        this.sunCaption.classList.toggle("low", day < 0.28);
      } else {
        this.sunCaption.textContent = "daylight";
        this.sunCaption.classList.remove("low");
      }

      this.feverWrap.classList.toggle("on", s.feverOn);
      this.feverFill.style.width = `${Math.max(0, Math.min(1, s.fever)) * 100}%`;

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
      this.speedLines.style.opacity = String(Math.max(0, (s.speedNorm - 0.55) * 1.6));

      // altitude gauge (log-ish so low hops still read, big launches still climb)
      const aN = Math.min(1, Math.pow(s.altitude / 340, 0.65));
      this.altFill.style.height = `${aN * 100}%`;
      this.altBird.style.bottom = `calc(${aN * 100}% - 9px)`;
      this.altRead.textContent = `${Math.round(s.altitude)} m`;
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
              `<span class="pu" title="${p.label} — ${Math.ceil(p.time)}s left"><i>${p.icon}</i><u>${p.label} · ${Math.ceil(p.time)}s</u><b style="width:${Math.max(0, Math.min(1, p.time / p.total)) * 100}%"></b></span>`,
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

      this.versusBar.classList.toggle("hidden", !s.versus);
      if (s.versus && s.p1Stats && s.p2Stats) {
        const pct = (d: number): number => Math.min(100, (d / s.raceFinish) * 100);
        this.versusBar.innerHTML =
          `<div class="vs-row p1"><span>P1</span><i><b style="width:${pct(s.p1Stats.distance)}%"></b></i><em>${Math.round(s.p1Stats.distance)}m</em></div>` +
          `<div class="vs-row p2"><span>P2</span><i><b style="width:${pct(s.p2Stats.distance)}%"></b></i><em>${Math.round(s.p2Stats.distance)}m</em></div>`;
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

      // Rewarded ad placement banners (in-game)
      this.shieldRefillEl.classList.toggle("hidden", !s.shieldRefillAvailable || s.shield > 0);
      this.gemMultBanner.classList.toggle("hidden", !s.gemMultAvailable || s.gemMultActive);
      // Voice control mic indicator
      this.voiceIndicator.classList.toggle("hidden", !s.settings.voiceEnabled || !s.voiceSupported);
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

  dispose(): void {
    cancelAnimationFrame(this.auroraRaf);
    this.root.remove();
  }

  private renderStatic(s: HudSnapshot): void {
    if (s.state === "menu" || (s.state === "gameover" && s.screen !== "main")) {
      this.menuCard.className = `glass-card ${s.screen === "shop" || s.screen === "pass" ? "wide" : ""}`;
      this.menuCard.innerHTML = this.renderScreen(s);
      // Post-render: inject TTS/voice buttons into settings
      if (s.screen === "settings") {
        const voiceRow = `<div class="setting-row"><span>🎤 Voice control</span><button class="toggle ${s.voiceSupported ? "on" : ""}" data-ui data-action="set-voice" aria-pressed="${String(s.voiceSupported)}" aria-label="Voice control"><i></i></button></div>`;
        const ttsRow = `<div class="setting-row"><span>🔊 Voice feedback</span><button class="toggle ${s.ttsEnabled ? "on" : ""}" data-ui data-action="set-tts" aria-pressed="${String(s.ttsEnabled)}" aria-label="Voice feedback"><i></i></button></div>`;
        // Keep retrying until the card has the buttons
        let attempts = 0;
        const tryInject = () => {
          const card = this.menuCard;
          if (card && !card.querySelector('[data-action="set-tts"]') && attempts < 10) {
            const html = card.innerHTML;
            const notifIdx = html.indexOf('Notifications');
            if (notifIdx > 0) {
              card.innerHTML = html.substring(0, notifIdx) + voiceRow + ttsRow + html.substring(notifIdx);
            }
            attempts++;
            if (!card.querySelector('[data-action="set-tts"]')) setTimeout(tryInject, 50);
          }
        };
        setTimeout(tryInject, 0);
      }
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
      case "multiplayer":
        return renderMultiplayer(s);
      case "stats":
        return renderStats(s);
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
    this.sunCaption = grab("sunCaption");
    this.feverWrap = grab("feverWrap");
    this.feverFill = grab("feverFill");
    this.hintEl = grab("hint");
    this.menuEl = grab("menu");
    this.menuCard = grab("menuCard");
    this.auroraCanvas = grab("auroraCanvas") as HTMLCanvasElement;
    this.startAurora();
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
    this.goalStrip = grab("goalStrip");
    this.goalPop = grab("goalPop");
    this.shieldRefillEl = grab("shieldRefill");
    this.comboFloatLayer = grab("comboFloatLayer");
    this.borderGlow = grab("borderGlow");
    this.gemMultBanner = grab("gemMultBanner");
    this.voiceIndicator = grab("voiceIndicator");
  }

  /** Show a floating "+1" text that rises and fades at a world position. */
  floatText(text: string, _worldX: number, _worldY: number, kind = "info"): void {
    const el = document.createElement("div");
    el.className = `float-text ft-${kind}`;
    el.textContent = text;
    el.style.left = `${50 + (Math.random() - 0.5) * 10}%`;
    el.style.top = `${40 + Math.random() * 10}%`;
    this.comboFloatLayer.appendChild(el);
    void el.offsetWidth;
    el.classList.add("rise");
    window.setTimeout(() => el.remove(), 800);
  }

  /** Pulse the coins counter to show collection feedback. */
  coinBump(): void {
    if (!this.coinsEl) return;
    this.coinsEl.style.transform = "scale(1.3)";
    this.coinsEl.style.transition = "transform 0.1s cubic-bezier(0.2, 1.4, 0.3, 1)";
    window.setTimeout(() => {
      this.coinsEl.style.transform = "scale(1)";
      this.coinsEl.style.transition = "transform 0.2s ease";
    }, 100);
  }

  /** Show a floating combo number that rises and fades. */
  comboFloat(combo: number): void {
    const el = document.createElement("div");
    el.className = `combo-float c${Math.min(combo, 15)}`;
    el.textContent = `×${combo}`;
    this.comboFloatLayer.appendChild(el);
    // Trigger reflow then animate
    void el.offsetWidth;
    el.classList.add("rise");
    window.setTimeout(() => el.remove(), 1400);
  }

  /** Update the screen border glow intensity based on combo level. */
  updateBorderGlow(combo: number): void {
    if (combo < 2) {
      this.borderGlow.className = "border-glow";
      return;
    }
    const intensity = Math.min(1, combo / 10);
    const hue = 40 + combo * 3;
    this.borderGlow.className = `border-glow active`;
    this.borderGlow.style.setProperty("--glow-alpha", String(0.15 + intensity * 0.45));
    this.borderGlow.style.setProperty("--glow-hue", String(hue));
  }

  private startAurora(): void {
    const cvs = this.auroraCanvas;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    const BANDS = 5;
    const bands = Array.from({ length: BANDS }, (_, i) => ({
      hue: 190 + i * 28,
      y: 0.15 + i * 0.14,
      amp: 0.04 + i * 0.012,
      freq: 0.6 + i * 0.35,
      speed: 0.18 + i * 0.09,
      alpha: 0.07 + (BANDS - i) * 0.025,
      width: 0.18 + i * 0.06,
      phase: i * 1.4,
    }));

    // Pre-compute static star fractional positions (0..1) — avoid per-frame layout reads
    const STAR_COUNT = 60;
    const starFx = Array.from({ length: STAR_COUNT }, (_, i) => (i * 137.508) % 1);
    const starFy = Array.from({ length: STAR_COUNT }, (_, i) => (i * 97.3) % 1);
    const starR  = Array.from({ length: STAR_COUNT }, (_, i) => 0.7 + (i % 3) * 0.4);

    let t = 0;
    let W = 0;
    let H = 0;

    const draw = () => {
      this.auroraRaf = requestAnimationFrame(draw);

      // Skip frames when menu is hidden (saves GPU during gameplay)
      if (this.menuEl.classList.contains("hidden")) return;

      // Resize canvas only when dimensions changed — avoids layout thrash
      const nw = cvs.offsetWidth;
      const nh = cvs.offsetHeight;
      if (nw !== W || nh !== H) {
        W = nw; H = nh;
        cvs.width = W; cvs.height = H;
      }
      if (W === 0 || H === 0) return;

      ctx.clearRect(0, 0, W, H);

      for (const b of bands) {
        const cy = b.y * H + Math.sin(t * b.speed + b.phase) * b.amp * H;
        const bH = b.width * H;
        const grad = ctx.createLinearGradient(0, cy - bH, 0, cy + bH);
        grad.addColorStop(0,   `hsla(${b.hue},90%,70%,0)`);
        grad.addColorStop(0.4, `hsla(${b.hue},90%,70%,${b.alpha})`);
        grad.addColorStop(0.6, `hsla(${b.hue + 20},85%,75%,${b.alpha * 0.7})`);
        grad.addColorStop(1,   `hsla(${b.hue},90%,70%,0)`);

        ctx.beginPath();
        ctx.moveTo(0, cy);
        for (let x = 0; x <= W; x += 4) {
          const wave = Math.sin(x * b.freq * 0.008 + t * b.speed * 1.6 + b.phase) * b.amp * H * 0.8;
          ctx.lineTo(x, cy + wave);
        }
        ctx.lineTo(W, H);
        ctx.lineTo(0, H);
        ctx.closePath();

        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
      }

      // Twinkle star field — static positions scaled to current W/H
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = "#fff";
      for (let i = 0; i < STAR_COUNT; i++) {
        ctx.globalAlpha = 0.3 + Math.sin(t * 0.8 + i) * 0.25;
        ctx.beginPath();
        ctx.arc(starFx[i]! * W, starFy[i]! * H * 0.7, starR[i]!, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      t += 0.012;
    };
    draw();
  }
}

/* ---------- templates ---------- */

/** Sanitize a string for safe interpolation into innerHTML. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hex(n: number): string {
  return `#${n.toString(16).padStart(6, "0")}`;
}

function head(title: string, backAction = "back", right = ""): string {
  return `<div class="screen-head"><button class="back-btn" data-ui data-action="${backAction}" aria-label="Back">‹</button><h2>${title}</h2><span>${right}</span></div>`;
}

function upsellStrip(): string {
  return `<button class="upsell" data-ui data-action="open-paywall"><div><b>✦ Sunbird Gold &amp; VIP</b><span>2× coins · no breaks · Phoenix &amp; Aurora skins · Nest Pass</span></div><span class="mini-btn gold">See</span></button>`;
}

/** Compact inline mission cards — 3 active missions shown as pill rows */
function renderMissionPreview(missions: MissionView[], quests: QuestView[]): string {
  // Prioritise: active quests first, then incomplete missions, up to 3 total
  const activeQuests = quests.filter(q => !q.done).slice(0, 2);
  const activeMissions = missions.filter(m => !m.done).slice(0, 3 - activeQuests.length);
  const items: string[] = [];

  for (const q of activeQuests) {
    const pct = Math.min(100, Math.round((q.progress / q.def.target) * 100));
    items.push(`<div class="mission-pill">
      <span class="mp-icon">⚡</span>
      <div class="mp-body">
        <div class="mp-label">${q.def.label}</div>
        <div class="mp-bar"><div class="mp-fill" style="width:${pct}%"></div></div>
      </div>
      <span class="mp-reward">+${q.def.reward}🪙</span>
    </div>`);
  }
  for (const m of activeMissions) {
    const pct = Math.min(100, Math.round((m.progress / m.def.target) * 100));
    items.push(`<div class="mission-pill">
      <span class="mp-icon">🎯</span>
      <div class="mp-body">
        <div class="mp-label">${m.def.title}</div>
        <div class="mp-bar"><div class="mp-fill" style="width:${pct}%"></div></div>
      </div>
      <span class="mp-prog">${Math.min(m.progress, m.def.target)}/${m.def.target}</span>
    </div>`);
  }

  if (!items.length) return '';
  return `<div class="mission-preview">${items.join('')}</div>`;
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

function renderModes(s: HudSnapshot): string {
  return `
    ${head("Game modes")}
    <p class="tagline">Same hills, different pressure. Every mode shares your unlocks.</p>
    <div class="mode-list">
      ${s.modes
        .map((m) => {
          let badge = "";
          let meta = m.finish ? `${m.finish / 1000} km` : m.clock ? `${m.clock}s` : "∞";
          if (m.id === "daily") {
            badge = s.dailyPlayed ? '<span class="tag on">Played</span>' : '<span class="tag">New</span>';
            meta = s.dailyTimeLeft;
          } else if (m.id === "weekly") {
            badge = s.weeklyPlayed ? '<span class="tag on">Played</span>' : '<span class="tag">New</span>';
            meta = s.weeklyTimeLeft;
          }
          return `<button class="mode-card ${m.id === s.modeId ? "on" : ""}" data-ui data-action="pick-mode" data-id="${m.id}">
            <span class="mode-icon">${m.icon}</span>
            <span class="mode-body"><b>${m.name}</b><em>${m.blurb}</em></span>
            <span class="mode-meta">${meta} ${badge}</span>
          </button>`;
        })
        .join("")}
    </div>
    ${s.dailyPlayed ? `<div class="reward-strip">${s.dailyLabel} — ${s.dailyTopScores.length > 0 ? `Your best: ${formatDistance(s.dailyTopScores[0]!.distance)}` : "Played"}</div>` : ""}
    ${s.weeklyPlayed ? `<div class="reward-strip">${s.weeklyLabel} — ${s.weeklyTopScores.length > 0 ? `Your best: ${formatDistance(s.weeklyTopScores[0]!.distance)}` : "Played"}</div>` : ""}
    ${s.multiplayerAvailable ? `<button class="soft-btn wide" data-ui data-action="open-multiplayer">🌐 Online Multiplayer</button>` : ""}
  `;
}

function renderMultiplayer(s: HudSnapshot): string {
  const p = s.mpPlayers;
  if (s.mpState === "idle" || s.mpState === "connecting") {
    return `
      ${head("Online Multiplayer", "back", `<span class="pill">${s.mpConnected ? "Connected" : "Connecting..."}</span>`)}
      <p class="tagline">Race against players from around the world. Up to 30 players per room.</p>
      <button class="primary-btn" data-ui data-action="create-room">Create Room</button>
      <div class="redeem">
        <input data-ui data-ref="roomCode" placeholder="Room code (e.g. ABC123)" maxlength="6" autocomplete="off" style="text-transform:uppercase;letter-spacing:0.1em" />
        <button class="mini-btn" data-ui data-action="join-room">Join</button>
      </div>
    `;
  }
  if (s.mpState === "lobby") {
    const rows = p.map(pl => `<div class="mp-player-row"><span class="mp-dot" style="background:#${pl.color.toString(16).padStart(6,"0")}"></span><span class="mp-name">${escapeHtml(pl.name)}</span>${pl.ready ? '<span class="tag on">Ready</span>' : '<span class="tag">Waiting</span>'}</div>`).join("");
    
    // Color selection options
    const colorOptions = [
      { id: 'sunset', preview: '#ff7a45' },
      { id: 'ocean', preview: '#4a9eff' },
      { id: 'forest', preview: '#4ade80' },
      { id: 'royal', preview: '#9370db' },
      { id: 'crimson', preview: '#dc143c' },
      { id: 'golden', preview: '#ffd700' },
      { id: 'midnight', preview: '#191970' },
      { id: 'cherry', preview: '#ff69b4' },
    ];
    const colorBtns = colorOptions.map(c => 
      `<button class="color-btn" data-ui data-action="select-color" data-color="${c.id}" style="width:32px;height:32px;border-radius:50%;border:2px solid ${s.selectedColor === c.id ? '#ffd700' : 'transparent'};background:${c.preview};cursor:pointer;"></button>`
    ).join('');
    
    return `
      ${head("Room " + escapeHtml(s.mpRoomCode), "leave-room", `<span class="pill">${p.length}/30</span>`)}
      <div class="mp-lobby">
        <div class="section-title">Choose Your Color</div>
        <div class="color-selection" style="display:flex;gap:8px;justify-content:center;margin-bottom:16px;">
          ${colorBtns}
        </div>
        <div class="section-title">Players</div>
        <div class="mp-players">${rows || '<div class="row empty">Waiting for players...</div>'}</div>
        ${s.platform === "poki" ? "" : `
        <div class="section-title">Chat</div>
        <div class="mp-chat-box">${s.mpChat.map(c => `<div class="mp-chat-msg"><b>${escapeHtml(c.from)}:</b> ${escapeHtml(c.msg)}</div>`).join("")}</div>
        <div class="redeem">
          <input data-ui data-ref="chatInput" placeholder="Say something..." maxlength="200" autocomplete="off" />
          <button class="mini-btn" data-ui data-action="send-chat">Send</button>
        </div>
        `}
        <div class="mp-actions">
          <button class="soft-btn" data-ui data-action="ready-up">Ready Up</button>
          ${s.mpIsHost ? `<button class="primary-btn" data-ui data-action="start-mp-race">Start Race</button>` : ""}
        </div>
      </div>
    `;
  }
  if (s.mpState === "results") {
    const sorted = [...p].sort((a, b) => a.rank - b.rank || b.distance - a.distance);
    return `
      ${head("Race Results", "leave-room")}
      <div class="mp-results">
        ${sorted.map((pl, i) => `<div class="mp-result-row ${i === 0 ? "winner" : ""}"><span class="mp-rank">#${pl.rank || i + 1}</span><span class="mp-dot" style="background:#${pl.color.toString(16).padStart(6,"0")}"></span><span class="mp-name">${escapeHtml(pl.name)}</span><span class="mp-dist">${Math.round(pl.distance)}m</span></div>`).join("")}
      </div>
      <button class="primary-btn" data-ui data-action="create-room">Race Again</button>
      <button class="ghost-btn" data-ui data-action="leave-room">Leave</button>
    `;
  }
  // racing state — show compact HUD
  return `
    ${head("Racing", "leave-room", `<span class="pill">${p.length} players</span>`)}
    <div class="mp-race-hud">
      ${p.map(pl => `<div class="mp-race-row ${!pl.alive ? "dead" : ""}"><span class="mp-dot" style="background:#${pl.color.toString(16).padStart(6,"0")}"></span><span class="mp-name">${escapeHtml(pl.name)}</span><span class="mp-dist">${Math.round(pl.distance)}m</span></div>`).join("")}
    </div>
  `;
}

function renderVersusResult(s: HudSnapshot): string {
  const a = s.p1Stats!;
  const b = s.p2Stats!;
  const row = (label: string, x: number, y: number, fmt: (n: number) => string): string => {
    const win = x === y ? 0 : x > y ? 1 : 2;
    return `<div class="vs-stat"><span class="${win === 1 ? "w" : ""}">${fmt(x)}</span><em>${label}</em><span class="${win === 2 ? "w" : ""}">${fmt(y)}</span></div>`;
  };
  const time = (r: RacerStats): string => (r.finishedAt > 0 ? `${r.finishedAt.toFixed(1)}s` : "DNF");
  return `
    <div class="vs-crown">${s.versusWinner === 1 ? "🥇 PLAYER 1 WINS" : "🥇 PLAYER 2 WINS"}</div>
    <div class="vs-head"><span class="p1">P1</span><span class="p2">P2</span></div>
    <div class="vs-stats">
      <div class="vs-stat"><span>${time(a)}</span><em>race time</em><span>${time(b)}</span></div>
      ${row("distance", a.distance, b.distance, (n) => `${Math.round(n)}m`)}
      ${row("max altitude", a.maxAltitude, b.maxAltitude, (n) => `${Math.round(n)}m`)}
      ${row("perfect ramps", a.perfects, b.perfects, (n) => String(n))}
      ${row("best combo", a.bestCombo, b.bestCombo, (n) => `×${n}`)}
      ${row("coins", a.coins, b.coins, (n) => String(n))}
      ${row("top speed", a.topSpeed, b.topSpeed, (n) => `${Math.round(n)}`)}
    </div>
    <button class="primary-btn" data-ui data-action="versus">Rematch</button>
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

function renderLeaderboardPreview(s: HudSnapshot): string {
  const top = s.highScores.slice(0, 3);
  if (top.length === 0) return "";
  const medals = ["🥇", "🥈", "🥉"];
  const rows = top
    .map(
      (h, i) =>
        `<div class="lb-row ${i === 0 ? "lb-gold" : ""}">
          <span class="lb-rank">${medals[i]}</span>
          <span class="lb-dist">${formatDistance(h.distance)}</span>
          <span class="lb-score">${Math.floor(h.score).toLocaleString()}</span>
        </div>`,
    )
    .join("");
  return `
    <div class="leaderboard-preview">
      <div class="lb-header">
        <span class="lb-title">🏆 Top Glides</span>
        <button class="lb-more" data-ui data-action="open-scores">View all →</button>
      </div>
      ${rows}
    </div>
  `;
}

function renderSidePersonal(s: HudSnapshot): string {
  const medals = ["🥇", "🥈", "🥉"];
  const top = s.highScores.slice(0, 5);
  if (!top.length) return "";
  return `
    <div class="side-panel-title">🏆 Your Bests</div>
    ${top.map((h, i) => `
      <div class="side-row">
        <span class="side-medal">${medals[i] ?? `#${i + 1}`}</span>
        <span class="side-dist">${formatDistance(h.distance)}</span>
        <span class="side-score">${Math.floor(h.score).toLocaleString()}</span>
      </div>`).join("")}
    <button class="side-more" data-ui data-action="open-scores">All scores →</button>
  `;
}

function renderSideGlobal(s: HudSnapshot): string {
  const top = s.globalLbTop.slice(0, 5);
  const medals = ["🥇", "🥈", "🥉"];
  return `
    <div class="side-panel-title">🌍 Global</div>
    ${top.length ? top.map((g) => `
      <div class="side-row">
        <span class="side-medal">${g.rank <= 3 ? medals[g.rank - 1] : `#${g.rank}`}</span>
        <span class="side-dist">${formatDistance(g.distance)}</span>
        <span class="side-name">${escapeHtml(g.name)}</span>
      </div>`).join("") : '<div class="side-empty">No scores yet</div>'}
    ${s.globalLbRank > 0 ? `<div class="side-your-rank">You: <b>#${s.globalLbRank}</b> / ${s.globalLbTotal}</div>` : ""}
  `;
}

function renderMain(s: HudSnapshot): string {
  const modes: { id: SeedMode; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "yesterday", label: "Yesterday" },
    { id: "random", label: "Wild" },
  ];
  const seedPicker = s.gold
    ? `<div class="seg">${modes
        .map((m) => `<button data-ui data-action="seed-${m.id}" class="${s.seedMode === m.id ? "on" : ""}">${m.label}</button>`)
        .join("")}</div>`
    : `<button class="lock-chip" data-ui data-action="open-paywall">🔒 Pick your world with Gold</button>`;

  const hasBest = s.bestDistance > 50;
  const medals = ["🥇", "🥈", "🥉"];
  const globalTop = s.globalLbTop.slice(0, 5);

  return `
    <!-- ── HERO ── -->
    <div class="home-hero">
      <div class="home-logo">✦</div>
      <h1 class="home-title">SUNBIRD</h1>
      <p class="home-sub">Chase the daylight · glide the hills</p>
    </div>

    <!-- ── GLOBAL LEADERBOARD (topmost — most prominent) ── -->
    <div class="home-section global-card">
      <div class="section-header">
        <span class="section-icon">🌍</span>
        <span class="section-title">Global Leaderboard</span>
        <button class="section-more" data-ui data-action="open-scores">View all →</button>
      </div>
      ${s.globalLbRank > 0 ? `<div class="global-rank-badge">Your rank: <b>#${s.globalLbRank}</b> / ${s.globalLbTotal.toLocaleString()}</div>` : ""}
      ${globalTop.length ? `
        <div class="global-table">
          ${globalTop.map((g) => `
            <div class="global-row ${g.rank <= 3 ? "top" : ""}">
              <span class="global-medal">${g.rank <= 3 ? medals[g.rank - 1] : `#${g.rank}`}</span>
              <span class="global-name">${escapeHtml(g.name)}</span>
              <span class="global-dist">${formatDistance(g.distance)}</span>
              <span class="global-score">${Math.floor(g.score).toLocaleString()}</span>
            </div>
          `).join("")}
        </div>
      ` : '<div class="global-empty">No scores yet — be the first!</div>'}
    </div>

    <!-- ── MULTIPLAYER ── -->
    <div class="home-section">
      <div class="section-header">
        <span class="section-icon">🌐</span>
        <span class="section-title">Multiplayer</span>
      </div>
      <div class="mp-quick-actions">
        <button class="soft-btn wide" data-ui data-action="open-multiplayer">🎯 Join or Create Room</button>
        <button class="soft-btn wide2" data-ui data-action="mode-select">🎮 Game Modes</button>
      </div>
    </div>

    <!-- ── STATS BAR ── -->
    <div class="home-stats">
      <div class="home-stat">
        <span class="hs-val">● ${s.wallet.toLocaleString()}</span>
        <span class="hs-lbl">coins</span>
      </div>
      <div class="home-stat accent">
        <span class="hs-val">🔥 ${s.streakDays}</span>
        <span class="hs-lbl">streak</span>
      </div>
      ${hasBest ? `<div class="home-stat">
        <span class="hs-val">${formatDistance(s.bestDistance)}</span>
        <span class="hs-lbl">best</span>
      </div>` : ""}
      <div class="home-stat">
        <span class="hs-val">${s.skillLabel}</span>
        <span class="hs-lbl">rank</span>
      </div>
    </div>

    <!-- ── SEED & WORLD ── -->
    <div class="home-world">
      <span class="home-seed-label">${s.seedLabel}</span>
      ${seedPicker}
    </div>

    <!-- ── ALERTS ── -->
    ${s.streakBroken && s.streakSaveAvailable ? `<div class="home-alert warn"><span>⚠ Streak broken!</span><button class="mini-btn" data-ui data-action="ad-streak-save">🎬 Save it</button></div>` : ""}

    <!-- ── PRIMARY CTA ── -->
    <div class="home-cta-area">
      <button class="primary-btn big" data-ui data-action="start">
        ▶ Hold to Fly
        <small>HOLD ↓ dive · RELEASE ↑ glide</small>
      </button>
    </div>

    <!-- ── MISSIONS — compact preview + collapsible full list ── -->
    ${renderMissionPreview(s.missions, s.quests)}
    <details class="home-collapsible">
      <summary class="collapsible-header">
        <span>📋 Missions & Quests</span>
        <span class="collapsible-badge">${s.missions.length + s.quests.length}</span>
        <span class="collapsible-arrow">▾</span>
      </summary>
      <div class="collapsible-body">
        ${renderGoalList(s.sessionGoals)}
        ${renderQuests(s.quests)}
        ${s.bonusQuestAvailable && !s.bonusQuestEarned ? `<button class="soft-btn wide ad-reward" data-ui data-action="ad-bonus-quest">🎬 Watch ad · bonus quest <small>+50 coins</small></button>` : ""}
        ${s.bonusQuestEarned ? `<div class="quest done"><div><div class="mt">${s.bonusQuestLabel}</div></div><span class="qr">● 50</span></div>` : ""}
        ${renderMissions(s.missions)}
      </div>
    </details>

    <!-- ── LOCAL SCORES (collapsible) ── -->
    <details class="home-collapsible">
      <summary class="collapsible-header">
        <span>🏆 Your Scores</span>
        <span class="collapsible-badge">${s.highScores.length}</span>
        <span class="collapsible-arrow">▸</span>
      </summary>
      <div class="collapsible-body">
        ${renderLeaderboardPreview(s)}
      </div>
    </details>

    <!-- ── NAV GRID ── -->
    <div class="home-nav">
      <button class="nav-tile" data-ui data-action="open-shop">
        <span class="nav-icon">🛍</span><span class="nav-lbl">Shop</span>
      </button>
      <button class="nav-tile" data-ui data-action="open-pass">
        <span class="nav-icon">🎟</span><span class="nav-lbl">Pass <small>Lv.${s.season.tier}</small></span>
      </button>
      <button class="nav-tile" data-ui data-action="open-trophies">
        <span class="nav-icon">🏅</span><span class="nav-lbl">${s.trophyCounts.unlocked}/${s.trophyCounts.total}</span>
      </button>
      <button class="nav-tile" data-ui data-action="open-atlas">
        <span class="nav-icon">🗺</span><span class="nav-lbl">Atlas</span>
      </button>
      <button class="nav-tile" data-ui data-action="open-stats">
        <span class="nav-icon">📊</span><span class="nav-lbl">Stats</span>
      </button>
      <button class="nav-tile" data-ui data-action="open-account">
        <span class="nav-icon">👤</span><span class="nav-lbl">Account</span>
      </button>
      <button class="nav-tile" data-ui data-action="open-settings">
        <span class="nav-icon">⚙</span><span class="nav-lbl">Settings</span>
      </button>
    </div>

    ${!s.gold || !s.vip ? `<button class="soft-btn gold wide" data-ui data-action="open-paywall" style="margin-top:6px">✦ Unlock Gold &amp; VIP perks</button>` : ""}

    <!-- ── NEST / MULTIPLIER ── -->
    <div class="home-nest-row">
      <span>🪺 Nest Lv.${s.nestLevel}</span>
      <span class="home-mult">×${s.nestMult.toFixed(2)} coin boost</span>
      ${s.gold ? '<span class="pill gold" style="font-size:11px">✦ Gold</span>' : ""}
      ${s.vip ? '<span class="pill vip" style="font-size:11px">♛ VIP</span>' : ""}
    </div>
  `;
}

function renderSkinCard(v: SkinView): string {
  const d = v.def;
  const swatch = `<div class="bird-swatch" style="--body:${hex(d.body)};--wing:${hex(d.wing)};--belly:${hex(d.belly)}"><i class="w"></i><i class="b"></i><i class="e"></i></div>`;
  let action: string;
  if (v.equipped) action = `<span class="tag on">Equipped</span>`;
  else if (v.owned) action = `<button class="mini-btn" data-ui data-action="equip-skin" data-id="${d.id}">Equip</button>`;
  else if (v.locked)
    action = `<button class="mini-btn ${v.lockReason === "vip" ? "vip" : "gold"}" data-ui data-action="open-paywall">${v.lockReason === "vip" ? "♛ VIP" : "✦ Gold"}</button>`;
  else action = `<button class="mini-btn ${v.affordable ? "" : "off"}" data-ui data-action="buy-skin" data-id="${d.id}">● ${d.price}</button>`;
  const rarityBadge = `<div class="rarity-badge ${d.rarity}">${d.rarity}</div>`;
  return `<div class="skin-card rarity-${d.rarity} ${v.equipped ? "equipped" : ""}">${swatch}<div class="sk-name">${d.name}</div><div class="sk-perk">${d.perk}</div>${rarityBadge}${action}</div>`;
}

function renderBoostRow(v: BoostView): string {
  const d = v.def;
  const action = v.armed
    ? `<span class="tag on">Armed ✓</span>`
    : `<button class="mini-btn ${v.affordable ? "" : "off"}" data-ui data-action="buy-boost" data-id="${d.id}">● ${d.price}</button>`;
  return `<div class="boost-row ${v.armed ? "armed" : ""}"><span class="bi">${d.icon}</span><div><div class="mt">${d.name}</div><div class="md">${d.desc}</div></div>${action}</div>`;
}

function renderShop(s: HudSnapshot): string {
  return `
    ${head("Shop", "back", `<span class="pill coin">● ${s.wallet}</span>`)}
    <div class="section-title">Birds</div>
    ${s.skinTrialAvailable && !s.skinTrialActive ? `<button class="soft-btn wide ad-reward" data-ui data-action="ad-skin-trial">🎬 Watch ad · try any skin for 1 run</button>` : ""}
    ${s.skinTrialActive ? `<div class="reward-strip gold">All skins unlocked for your next run!</div>` : ""}
    <div class="skin-grid">${s.skins.map(renderSkinCard).join("")}</div>
    <div class="section-title">Boosts <small>armed for your next flight</small></div>
    <div class="boost-list">${s.boosts.map(renderBoostRow).join("")}</div>
    ${s.gold && s.vip ? "" : upsellStrip()}
    <p class="fineprint">Earn coins by flying, daily quests, streaks and the Nest Pass.</p>
  `;
}

function renderPaywall(s: HudSnapshot): string {
  const portal = s.platform === "poki" || s.platform === "crazy";
  if (portal) {
    return `
      ${head("Gold &amp; VIP")}
      <div class="gold-hero"><div class="gold-badge">✦</div><div class="gold-price">Unlock Gold<small> one-time</small></div></div>
      <ul class="feature-list">${s.goldFeatures.map((f) => `<li>${f}</li>`).join("")}</ul>
      ${
        s.gold
          ? `<div class="owned-banner">You own Gold. Thank you, sunbird ✦</div>`
          : `<button class="primary-btn gold" data-ui data-action="gold-buy">Watch ad to unlock Gold</button>`
      }
      <div class="gold-hero vip"><div class="gold-badge vip">♛</div><div class="gold-price">Unlock VIP<small> per month</small></div></div>
      <ul class="feature-list">${s.vipFeatures.map((f) => `<li>${f}</li>`).join("")}</ul>
      ${
        s.vip
          ? `<div class="owned-banner vip">VIP active — ${s.vipDaysLeft} day${s.vipDaysLeft === 1 ? "" : "s"} left${
              s.vipDaysLeft <= 5 ? " · renew soon to keep the perks" : ""
            }</div><button class="soft-btn wide vip" data-ui data-action="vip-buy">Watch ad to extend VIP</button>`
          : `<button class="primary-btn vip" data-ui data-action="vip-buy">Watch ad to unlock VIP</button>`
      }
      <div class="redeem"><input data-ui data-ref="redeem" placeholder="Promo code" maxlength="16" autocomplete="off" /><button class="mini-btn" data-ui data-action="redeem">Redeem</button></div>
      ${s.restoreMessage ? `<p class="note">${escapeHtml(s.restoreMessage)}</p>` : ""}
    `;
  }
  const stripeGold = s.checkoutMode === "stripe";
  return `
    ${head("Gold &amp; VIP")}
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
    ${s.restoreMessage ? `<p class="note">${escapeHtml(s.restoreMessage)}</p>` : ""}
    <p class="fineprint">${stripeGold ? "Payments are processed securely by Stripe." : "Demo storefront — nothing is charged."} Set <code>VITE_STRIPE_GOLD_LINK</code> / <code>VITE_STRIPE_VIP_LINK</code> to go live with real Stripe Payment Links — see .env.example.</p>
  `;
}

function renderCheckout(s: HudSnapshot): string {
  if (s.checkoutOk) {
    return `<div class="check-ok"><div class="gold-badge big">${s.checkoutSku === "sunbird_vip" ? "♛" : "✦"}</div><h2>You're ${s.checkoutSku === "sunbird_vip" ? "VIP" : "Gold"}!</h2><p class="tagline">Your perks are active immediately</p><button class="primary-btn gold" data-ui data-action="back">Fly on</button></div>`;
  }
  const item = s.checkoutSku === "sunbird_vip" ? { name: "Sunbird VIP · monthly", price: s.vipPrice } : { name: "Sunbird Gold · lifetime", price: s.goldPrice };
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
    <div class="setting-row"><span>Pilot name</span><button class="mini-btn" data-ui data-action="change-name">${s.playerName ? escapeHtml(s.playerName) : "Set name"}</button></div>
    ${toggle("Sound Effects", "mute", !s.settings.mute)}
    <div class="setting-row"><span>SFX Volume</span><button class="mini-btn" data-ui data-action="set-sfx-vol">${s.settings.mute ? "Muted" : `${sPct}%`}</button></div>
    ${toggle("Music", "music", s.settings.music)}
    <div class="setting-row"><span>Music Volume</span><button class="mini-btn" data-ui data-action="set-music-vol">${!s.settings.music ? "Off" : `${mPct}%`}</button></div>
    ${toggle("Haptics", "haptics", s.settings.haptics)}
    ${toggle("Reduce motion", "motion", s.settings.reduceMotion)}
    ${s.voiceSupported ? `<div class="setting-row"><span>🎤 Voice control</span><button class="toggle ${s.settings.voiceEnabled ? "on" : ""}" data-ui data-action="set-voice" aria-pressed="${String(s.settings.voiceEnabled)}" aria-label="Voice control"><i></i></button></div>` : ""}
    <div class="setting-row"><span>🔊 Voice feedback</span><button class="toggle ${s.ttsEnabled ? "on" : ""}" data-ui data-action="set-tts" aria-pressed="${String(s.ttsEnabled)}" aria-label="Voice feedback"><i></i></button></div>
    ${s.notifSupported ? `<div class="setting-row"><span>Notifications</span><button class="toggle ${s.notifSubscribed ? "on" : ""}" data-ui data-action="enable-notifications" aria-pressed="${s.notifSubscribed}" aria-label="Enable notifications"><i></i></button></div>` : ""}
    <div class="setting-row"><span>Render quality</span><button class="mini-btn" data-ui data-action="set-quality">${s.settings.quality.toUpperCase()}</button></div>
    <div class="setting-row"><span>Flights flown</span><b>${s.runsPlayed}</b></div>
    ${s.canInstall ? `<button class="soft-btn wide" data-ui data-action="install-app">⬇ Install Sunbird</button>` : ""}
    <button class="ghost-btn danger" data-ui data-action="reset-progress">${s.resetArmed ? "Tap again to erase everything" : "Reset progress"}</button>
    <p class="fineprint">Sunbird 2.5 Pro · ${s.seedLabel}</p>
  `;
}

function renderScores(s: HudSnapshot): string {
  const medals = ["🥇", "🥈", "🥉"];
  const topRows = s.highScores.slice(0, 3);
  const restRows = s.highScores.slice(3);
  return `
    ${head("High glides")}
    ${topRows.length ? `
      <div class="podium">
        ${topRows.map((h, i) => `
          <div class="podium-slot slot-${i}">
            <div class="podium-medal">${medals[i]}</div>
            <div class="podium-dist">${formatDistance(h.distance)}</div>
            <div class="podium-score">${Math.floor(h.score).toLocaleString()} pts</div>
            ${h.vip ? '<span class="podium-vip">✦</span>' : ""}
          </div>
        `).join("")}
      </div>
    ` : ""}
    ${restRows.length ? renderScoreTable(restRows) : ""}
    ${!s.highScores.length ? '<div class="score-table"><div class="row empty">No flights yet — hold to fly!</div></div>' : ""}
    <div class="menu-stats">
      <div>Today's best <b>${formatDistance(s.todayBest)}</b></div>
      <div>Flights <b>${s.runsPlayed}</b></div>
      <div>Total <b>${formatDistance(s.bestDistance)}</b></div>
    </div>
    <div class="section-title">🌍 Global</div>
    ${s.globalLbTop.slice(0, 10).length ? `
      <div class="score-table global-table">
        ${s.globalLbTop.slice(0, 10).map((g) => `
          <div class="row ${g.rank <= 3 ? "top" : ""}">
            <span>${g.rank <= 3 ? ["🥇", "🥈", "🥉"][g.rank - 1] : `#${g.rank}`}</span>
            <span>${formatDistance(g.distance)}</span>
            <span>${escapeHtml(g.name)}</span>
            <span>${Math.floor(g.score).toLocaleString()}</span>
          </div>
        `).join("")}
      </div>
    ` : '<div class="score-table"><div class="row empty">No global scores yet</div></div>'}
    ${s.globalLbRank > 0 ? `<div class="menu-stats"><div>Your global rank <b>#${s.globalLbRank} of ${s.globalLbTotal}</b></div></div>` : ""}
  `;
}

function rewardLabel(r: { kind: string; amount?: number; id?: string }): string {
  if (r.kind === "coins") return `● ${r.amount}`;
  if (r.kind === "skin") return `🪶 ${r.id}`;
  return `🎁 ${r.id}`;
}

function renderPass(s: HudSnapshot): string {
  const pct = Math.min(100, (s.season.have / s.season.need) * 100);
  const seasonPct = Math.round(s.seasonProgress * 100);
  const claimableFree = s.season.tiers.filter((t) => t.unlocked && !t.freeClaimed).length;
  const claimablePremium = s.season.tiers.filter((t) => t.unlocked && !t.premiumLocked && !t.premiumClaimed).length;
  const totalClaimable = claimableFree + claimablePremium;
  return `
    ${head(`Nest Pass · ${s.season.label}`, "back", `<span class="pill">Lv.${s.season.tier}/${s.season.maxTier}</span>`)}
    <div class="pass-countdown">Resets in ${s.seasonDaysLeft} day${s.seasonDaysLeft === 1 ? "" : "s"}</div>
    <div class="pass-season-bar"><i style="width:${seasonPct}%"></i><span>${seasonPct}% through season</span></div>
    <div class="pass-progress"><i style="width:${pct}%"></i></div>
    <p class="tagline">Fly to earn XP. Gold unlocks the premium track.</p>
    ${totalClaimable >= 2 ? `<button class="soft-btn wide" data-ui data-action="claim-pass-all">Claim All (${totalClaimable} rewards ready)</button>` : ""}
    ${!s.gold ? `<button class="upsell" data-ui data-action="open-paywall"><div><b>✦ Unlock premium rewards</b><span>Double the tier rewards with Gold</span></div><span class="mini-btn gold">Unlock</span></button>` : ""}
    <div class="tier-track">
      ${s.season.tiers
        .map((t) => {
          const canFree = t.unlocked && !t.freeClaimed;
          const canPremium = t.unlocked && !t.premiumLocked && !t.premiumClaimed;
          return `<div class="tier-card ${t.unlocked ? "unlocked" : ""}">
            <div class="tier-num">Lv.${t.tier}</div>
            <button class="tier-reward free ${t.freeClaimed ? "claimed" : ""}" data-ui data-action="${canFree ? "claim-pass-free" : ""}" data-id="${t.tier}" ${canFree ? "" : "disabled"}>${rewardLabel(t.free)}</button>
            <button class="tier-reward premium ${t.premiumClaimed ? "claimed" : ""} ${t.premiumLocked ? "locked" : ""}" data-ui data-action="${canPremium ? "claim-pass-premium" : ""}" data-id="${t.tier}" ${canPremium ? "" : "disabled"}>${t.premiumLocked ? "✦" : rewardLabel(t.premium)}</button>
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
  const showcase = [...s.achievementShowcase];
  return `
    ${head("Trophy Case", "back", `<span class="pill">${s.trophyCounts.unlocked}/${s.trophyCounts.total}</span>`)}
    ${showcase.length ? `
      <div class="section-title">Showcase</div>
      <div class="trophy-showcase">
        ${showcase.map((v) => {
          return `<div class="trophy showcase-card ${v.def.rarity}">
            <div class="trophy-icon big">🏆</div>
            <div class="trophy-name">${escapeHtml(v.def.title)}</div>
            <div class="trophy-desc">${escapeHtml(v.def.desc)}</div>
            <div class="trophy-rarity-badge ${v.def.rarity}">${v.def.rarity}</div>
            <button class="mini-btn" data-ui data-action="share-trophy" data-id="${v.def.id}">Share Trophy</button>
          </div>`;
        }).join("")}
      </div>
    ` : ""}
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
              <div class="trophy-name">${escapeHtml(v.def.title)}</div>
              <div class="trophy-desc">${escapeHtml(v.def.desc)}</div>
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
  const showcase = [...s.achievementShowcase];
  const seasonPct = Math.round(s.seasonProgress * 100);
  return `
    ${head("Profile")}
    <div class="section-title">Lifetime Stats</div>
    <div class="menu-stats">
      <div>Flights <b>${s.totalFlights}</b></div>
      <div>Distance <b>${formatDistance(s.totalDistance)}</b></div>
      <div>Coins <b>${s.totalCoins}</b></div>
      <div>Best Score <b>${Math.floor(s.bestDistance).toLocaleString()}</b></div>
    </div>
    <div class="section-title">Achievement Showcase</div>
    ${showcase.length ? `
      <div class="trophy-showcase compact">
        ${showcase.map((v) => {
          return `<div class="trophy showcase-card mini ${v.def.rarity}">
            <div class="trophy-icon">🏆</div>
            <div class="trophy-name">${escapeHtml(v.def.title)}</div>
            <div class="trophy-rarity-badge ${v.def.rarity}">${v.def.rarity}</div>
          </div>`;
        }).join("")}
      </div>
    ` : '<p class="tagline">No achievements unlocked yet — fly to earn trophies!</p>'}
    <div class="section-title">Current Season</div>
    <div class="pass-countdown">Resets in ${s.seasonDaysLeft} day${s.seasonDaysLeft === 1 ? "" : "s"}</div>
    <div class="pass-season-bar"><i style="width:${seasonPct}%"></i><span>Level ${s.season.tier}/${s.season.maxTier}</span></div>
    <div class="section-title">Daily Streak</div>
    <div class="menu-stats">
      <div>Streak <b>🔥 ${s.streakDaysCount} day${s.streakDaysCount === 1 ? "" : "s"}</b></div>
    </div>
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
      <div class="code-row"><span class="code">${escapeHtml(s.referralCode)}</span><button class="mini-btn" data-ui data-action="copy-referral">Copy</button></div>
      ${
        s.referralRedeemed
          ? `<p class="note">You've already redeemed a friend code. Thanks for joining!</p>`
          : `<div class="redeem"><input data-ui data-ref="friendcode" placeholder="Friend's code (SUN-XXXXXX)" maxlength="10" autocomplete="off" /><button class="mini-btn" data-ui data-action="redeem-referral">Apply</button></div>`
      }
      ${s.referralMessage ? `<p class="note">${escapeHtml(s.referralMessage)}</p>` : ""}
    </div>
    <div class="section-title">Cloud save</div>
    <div class="sheet">
      <p class="tagline">Copy this code to move your progress to another device.</p>
      <textarea class="cloud-box" data-ui data-ref="cloudExport" readonly rows="3">${escapeHtml(s.cloudCode)}</textarea>
      <button class="mini-btn" data-ui data-action="copy-cloud">Copy code</button>
      <p class="tagline" style="margin-top:10px">Paste a code from another device to restore it here:</p>
      <textarea class="cloud-box" data-ui data-ref="cloudImport" rows="3" placeholder="Paste save code…"></textarea>
      <button class="mini-btn" data-ui data-action="import-cloud">Import</button>
      ${s.cloudMessage ? `<p class="note">${escapeHtml(s.cloudMessage)}</p>` : ""}
    </div>
    <p class="fineprint">Cloud save codes are generated on this device — hook up a real account backend to sync automatically.</p>
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

function renderStats(s: HudSnapshot): string {
  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };
  const biomeEntries = Object.entries(s.lifetimeBiomeVisits);
  const topBiomes = biomeEntries.sort((a, b) => b[1] - a[1]).slice(0, 5);
  const avgDist = s.totalFlights > 0 ? s.totalDistance / s.totalFlights : 0;
  return `
    ${head("Run Statistics", "back")}
    <div class="section-title">Lifetime Stats</div>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">📏</div>
        <div class="stat-val">${formatDistance(s.totalDistance)}</div>
        <div class="stat-lbl">Total Distance</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">💰</div>
        <div class="stat-val">${s.totalCoins.toLocaleString()}</div>
        <div class="stat-lbl">Total Coins</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">✨</div>
        <div class="stat-val">${s.lifetimePerfects}</div>
        <div class="stat-lbl">Total Perfects</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🌤</div>
        <div class="stat-val">${Math.round(s.bestAltitude)} m</div>
        <div class="stat-lbl">Best Altitude</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🔥</div>
        <div class="stat-val">×${s.lifetimeBestCombo}</div>
        <div class="stat-lbl">Best Combo</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⏱</div>
        <div class="stat-val">${formatTime(s.lifetimePlayTime)}</div>
        <div class="stat-lbl">Play Time</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📊</div>
        <div class="stat-val">${formatDistance(avgDist)}</div>
        <div class="stat-lbl">Avg Run Distance</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🐦</div>
        <div class="stat-val">${s.totalFlights}</div>
        <div class="stat-lbl">Flights Flown</div>
      </div>
    </div>
    ${s.favoriteBiome ? `
    <div class="section-title">Favorite Biome</div>
    <div class="reward-strip">${s.favoriteBiome}</div>
    ` : ""}
    ${topBiomes.length ? `
    <div class="section-title">Biome Visits</div>
    <div class="score-table">
      ${topBiomes.map(([id, count]) => `
        <div class="row">
          <span>${escapeHtml(id)}</span>
          <span>${count} visit${count === 1 ? "" : "s"}</span>
        </div>
      `).join("")}
    </div>
    ` : ""}
    <p class="fineprint">Stats accumulate across all your flights.</p>
  `;
}

function renderDailyLeaderboard(s: HudSnapshot): string {
  const rows = s.dailyTopScores;
  if (!rows.length) return "";
  const medals = ["🥇", "🥈", "🥉"];
  return `
    <div class="leaderboard-preview">
      <div class="lb-header">
        <span class="lb-title">📅 ${s.dailyLabel}</span>
        <span class="lb-more">Resets in ${s.dailyTimeLeft}</span>
      </div>
      ${rows.map((r, i) => `
        <div class="lb-row ${i === 0 ? "lb-gold" : ""}">
          <span class="lb-rank">${i < 3 ? medals[i] : `#${i + 1}`}</span>
          <span class="lb-dist">${formatDistance(r.distance)}</span>
          <span class="lb-score">${Math.floor(r.score).toLocaleString()}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderWeeklyLeaderboard(s: HudSnapshot): string {
  const rows = s.weeklyTopScores;
  if (!rows.length) return "";
  const medals = ["🥇", "🥈", "🥉"];
  return `
    <div class="leaderboard-preview">
      <div class="lb-header">
        <span class="lb-title">🏆 ${s.weeklyLabel}</span>
        <span class="lb-more">Resets in ${s.weeklyTimeLeft}</span>
      </div>
      ${rows.map((r, i) => `
        <div class="lb-row ${i === 0 ? "lb-gold" : ""}">
          <span class="lb-rank">${i < 3 ? medals[i] : `#${i + 1}`}</span>
          <span class="lb-dist">${formatDistance(r.distance)}</span>
          <span class="lb-score">${Math.floor(r.score).toLocaleString()}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderGameOver(s: HudSnapshot): string {
  if (s.versus && s.p1Stats && s.p2Stats) return renderVersusResult(s);
  const questTotal = s.claimedQuests.reduce((a, q) => a + q.reward, 0);
  const isNewBest = s.highScores.length > 0 && s.distance >= s.highScores[0]!.distance;
  return `
    <div class="zzz">z z z</div>
    <h2>Sunbird sleeps</h2>
    <p class="tagline">The daylight ran out.</p>
    ${s.challengeActive ? `<div class="reward-strip gold">Challenge from ${escapeHtml(s.challengeFrom)}: Beat ${s.challengeScore.toLocaleString()} pts</div>` : ""}
    ${isNewBest ? '<div class="new-best-banner">✨ NEW PERSONAL BEST ✨</div>' : ""}
    <div class="over-stats">
      <div><span>Distance</span><b>${formatDistance(s.distance)}</b></div>
      <div><span>Score</span><b>${Math.floor(s.score).toLocaleString()}</b></div>
      <div><span>Coins</span><b>${s.coins}</b></div>
      <div><span>Perfects</span><b>${s.perfects}</b></div>
      <div><span>Zeniths</span><b>${s.zeniths}</b></div>
      <div><span>Islands</span><b>${s.island + 1}</b></div>
      ${s.globalLbRank > 0 ? `<div><span>Global rank</span><b>#${s.globalLbRank} / ${s.globalLbTotal}</b></div>` : ""}
    </div>
    ${s.dailyResult ? `<div class="reward-strip gold">📅 Daily Challenge — Rank #${s.dailyResult.rank} of ${s.dailyResult.totalPlayers}${s.dailyResult.isNewBest ? " · NEW BEST!" : ""}</div>` : ""}
    ${s.weeklyResult ? `<div class="reward-strip gold">🏆 Weekly Tournament — Rank #${s.weeklyResult.rank} of ${s.weeklyResult.totalPlayers}${s.weeklyResult.isNewBest ? " · NEW BEST!" : ""}</div>` : ""}
    ${s.ghostDelta !== null ? `<div class="reward-strip ${s.ghostDelta >= 0 ? "" : "nest"}">${s.ghostDelta >= 0 ? `Beat your ghost by ${Math.round(s.ghostDelta)}m! 👻` : `${Math.round(-s.ghostDelta)}m behind your best ghost`}</div>` : ""}
    ${questTotal ? `<div class="reward-strip">Daily quest${s.claimedQuests.length > 1 ? "s" : ""} complete · +${questTotal} coins</div>` : ""}
    ${s.newlyCompleted.length ? `<div class="reward-strip nest">Nest upgraded → Lv.${s.nestLevel} · ×${s.nestMult.toFixed(2)} score</div>` : ""}
    ${s.nearMiss ? `<div class="nearmiss">${s.nearMiss}</div>` : ""}
    <div class="reached-strip">Reached <b>${s.biomeEmoji} ${s.biomeName}</b> · Island ${s.island + 1}</div>
    ${s.doubleCoinsAvailable && !s.doubleCoinsEarned && !s.doubleCoinsUsed ? `<button class="soft-btn wide ad-reward" data-ui data-action="ad-double-coins">🎬 Watch ad · 2× coins this run <small>+${s.coins} coins</small></button>` : ""}
    ${s.doubleCoinsEarned ? `<div class="reward-strip gold">2× coins earned! +${s.coins} bonus coins</div>` : ""}
    ${s.headstartAdAvailable && !s.headstartAdUsed ? `<button class="soft-btn wide ad-reward" data-ui data-action="ad-headstart">🎬 Watch ad · free headstart boost 🚀</button>` : ""}
    ${s.headstartAdUsed ? `<div class="reward-strip">Headstart boost armed for next flight!</div>` : ""}
    <button class="primary-btn big" data-ui data-action="retry">Fly again <small>hold anywhere · R</small></button>
    ${renderGoalList(s.sessionGoals)}
    <button class="soft-btn wide" data-ui data-action="share" ${s.shareBusy ? "disabled" : ""}>${s.shareBusy ? "Preparing…" : "📤 Share this flight"}</button>
    <div class="btn-row">
      <button class="soft-btn" data-ui data-action="open-shop">🛍 Shop</button>
      <button class="soft-btn" data-ui data-action="open-pass">🎟 Pass</button>
      <button class="soft-btn" data-ui data-action="open-atlas">🗺 Atlas</button>
      <button class="soft-btn" data-ui data-action="open-scores">🏆 Scores</button>
      <button class="soft-btn" data-ui data-action="menu">Menu</button>
    </div>
    ${s.gold && s.vip ? "" : upsellStrip()}
    
    <!-- VIRAL SECTION: Social proof and sharing prompts -->
    <div class="viral-section">
      <div class="social-proof">🔥 ${Math.floor(Math.random() * 200 + 100)} players flying right now</div>
      ${s.isNewBest ? '<div class="viral-prompt new-best">✨ New record! Share your achievement?</div>' : ''}
      ${s.score > 1000 ? '<div class="viral-prompt">🎯 Impressive flight! Challenge a friend?</div>' : ''}
      ${s.ghostDelta !== null && s.ghostDelta > 0 ? '<div class="viral-prompt">👻 You beat your ghost! Share the victory?</div>' : ''}
      <div class="friend-code">Your code: <b>${escapeHtml(s.referralCode)}</b> — friends get +60 coins!</div>
    </div>
    
    ${renderQuests(s.quests)}
    ${renderMissions(s.missions, s.newlyCompleted)}
    ${s.modeId === "daily" ? renderDailyLeaderboard(s) : ""}
    ${s.modeId === "weekly" ? renderWeeklyLeaderboard(s) : ""}
    ${renderLeaderboardPreview(s)}
  `;
}

function renderContinue(s: HudSnapshot): string {
  return `
    <div class="zzz">z z z</div>
    <h2>Second wind?</h2>
    <p class="tagline">Sunbird is dozing off at ${formatDistance(s.distance)}.</p>
    <div class="count-ring" data-live="contTimer">${Math.ceil(s.continueTimer)}</div>
    ${s.gold ? `<button class="primary-btn gold" data-ui data-action="continue-gold">✦ Gold · free wake-up</button>` : ""}
    <button class="primary-btn ${s.canAffordContinue ? "" : "off"}" data-ui data-action="continue-coins" ${s.canAffordContinue ? "" : "disabled"}>Spend ● ${s.continueCost} <small>(you have ${s.wallet})</small></button>
    ${!s.gold && s.adAvailable ? `<button class="soft-btn wide" data-ui data-action="continue-ad">▶ Watch a short break</button>` : ""}
    <button class="ghost-btn" data-ui data-action="continue-sleep">Let it sleep</button>
  `;
}

function renderAd(s: HudSnapshot): string {
  return `
    <div class="ad-label">Sponsored break · ${s.adReason === "continue" ? "earning your second wind" : "between flights"}</div>
    <div class="ad-creative">
      <div class="ad-logo">🪺</div>
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
