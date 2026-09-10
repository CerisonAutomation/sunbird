import type { AchievementView } from "./Achievements";
import type { ActivePower } from "./PowerUps";
import type { SessionGoal } from "./Engagement";
import type { ModeDef } from "./Modes";
import type { RacerStats } from "./Racer";
import type { BoardMetric, BoardPage, BoardScope } from "./Leaderboard";
import type { TournamentView } from "./Tournaments";
import type { RosterBird, Standing } from "./MassRace";
import { VIP_DAILY_GIFT } from "./constants";
import { MenuSky } from "./MenuSky";
import type { BoostView, SkinView } from "./Economy";
import { formatDistance } from "./math";
import type { MissionView, QuestReward, QuestView } from "./Missions";
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
  | "live";

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
export type PortalName = "none" | "poki" | "crazy";

export type HudSnapshot = {
  state: UiState;
  screen: UiScreen;
  checkoutSku: "sunbird_gold" | "sunbird_vip";
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
  /** Personal best as it stood before this flight. */
  prevBestDistance: number;
  /** True for a player's first couple of flights. */
  firstRun: boolean;
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
  raceField: number;
  raceFinishTime: number;
  massRace: boolean;
  multiplayerLive: boolean;
  /* --- live room + roster --- */
  roster: RosterBird[];
  roomCode: string;
  roomCount: number;
  roomCapacity: number;
  netState: string;
  netError: string;
  draft: number;
  finishRemaining: number;
  nemesis: string;
  photoFinish: string;
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
  private draftMeter!: HTMLElement;
  private finishCd!: HTMLElement;
  private lastFinishCd = "";
  private emoteWheel!: HTMLElement;
  private lastStandings = "";
  private lastRoster = "";
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
  private readonly menuSky = new MenuSky();
  private readonly skyResize: ResizeObserver;
  private readonly live = {
    distance: -1,
    coins: -1,
    island: -1,
    mult: -1,
    sun: -1,
    sunLow: false,
    fever: -1,
    altFill: -1,
    altRead: -1,
    altZone: -1,
    speed: -1,
  };

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
            <div class="sun-caption">daylight</div>
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
        <div class="standings hidden" data-ref="standings"></div>
        <div class="roster-bar hidden" data-ref="rosterBar"></div>
        <div class="draft-meter hidden" data-ref="draftMeter"><i></i><span>SLIPSTREAM</span></div>
        <div class="finish-countdown hidden" data-ref="finishCd"></div>
        <div class="emote-wheel hidden" data-ref="emoteWheel">
          <button data-ui data-action="emote" data-id="👋">👋</button>
          <button data-ui data-action="emote" data-id="🔥">🔥</button>
          <button data-ui data-action="emote" data-id="😂">😂</button>
          <button data-ui data-action="emote" data-id="🫡">🫡</button>
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
          <p class="tagline">Your flight is waiting. The daylight timer is stopped.</p>
          <button class="primary-btn hero" data-ui data-action="resume"><span class="hero-label">Resume flight</span><span class="hero-hint">P or Esc</span></button>
          <div class="btn-row">
            <button class="soft-btn wide2" data-ui data-action="open-settings">⚙ Settings</button>
            <button class="ghost-btn wide2" data-ui data-action="menu">End flight</button>
          </div>
        </div>
      </div>

      <div class="overlay continue hidden" data-ref="continue"><div class="paper-card slim" data-ref="contCard"></div></div>
      <div class="overlay ad hidden" data-ref="ad"><div class="ad-card" data-ref="adCard"></div></div>
      <div class="overlay gameover hidden" data-ref="over"><div class="paper-card" data-ref="overCard"></div></div>

      <div class="toasts" data-ref="toasts"></div>
      <div class="flash" data-ref="flash"></div>
    `;
    // Living bird-flight backdrop, painted beneath every overlay.
    this.root.insertBefore(this.menuSky.host, this.root.firstChild);
    parent.appendChild(this.root);
    this.bind();

    this.skyResize = new ResizeObserver(() => {
      this.menuSky.resize(this.root.clientWidth, this.root.clientHeight);
    });
    this.skyResize.observe(this.root);
    this.menuSky.resize(parent.clientWidth || window.innerWidth, parent.clientHeight || window.innerHeight);
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
    const key = `${s.state}|${s.screen}|${s.version}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.renderStatic(s);
    }

    const inPlay = s.state === "playing" || s.state === "paused" || s.state === "continue";
    // The living backdrop only runs on the shell; never while racing.
    this.menuSky.setActive(s.state === "menu" || s.state === "gameover");
    this.playHud.classList.toggle("hidden", !inPlay);
    this.playHud.classList.toggle("versus", s.versus);
    // The shell card hosts every non-race screen. Paused gameplay can open
    // Settings/Scoreboard over the pause card without dead actions.
    const menuVisible = s.state === "menu" || (s.state === "gameover" && s.screen !== "main") || (s.state === "paused" && s.screen !== "main");
    this.menuEl.classList.toggle("hidden", !menuVisible);
    this.pauseEl.classList.toggle("hidden", !(s.state === "paused" && s.screen === "main"));
    this.contEl.classList.toggle("hidden", s.state !== "continue");
    this.adEl.classList.toggle("hidden", s.state !== "ad");
    this.overEl.classList.toggle("hidden", !(s.state === "gameover" && s.screen === "main"));

    if (inPlay) {
      // Every write below is guarded: the HUD runs at frame rate, so unchanged
      // values must never touch the DOM. This removes the main style/layout
      // churn identified in review.
      const roundedDistance = Math.round(s.distance);
      if (roundedDistance !== this.live.distance) {
        this.live.distance = roundedDistance;
        this.distanceEl.textContent = formatDistance(s.distance);
      }
      if (s.coins !== this.live.coins) {
        this.live.coins = s.coins;
        this.coinsEl.textContent = String(s.coins);
        this.bestEl.textContent = formatDistance(s.bestDistance);
      }
      if (s.island !== this.live.island) {
        this.live.island = s.island;
        this.islandEl.textContent = `Island ${s.island + 1}`;
      }
      const mult10 = Math.round(s.multiplier * 10);
      if (mult10 !== this.live.mult) {
        this.live.mult = mult10;
        this.multEl.textContent = `×${s.multiplier.toFixed(1)}`;
      }
      this.goldChip.classList.toggle("hidden", !s.gold);
      this.vipChip.classList.toggle("hidden", !s.vip);
      if (this.vipChip.textContent !== `♛ VIP · ${s.vipDaysLeft}d`) this.vipChip.textContent = `♛ VIP · ${s.vipDaysLeft}d`;
      if (s.ghostDelta === null) {
        this.ghostChip.classList.add("hidden");
      } else {
        this.ghostChip.classList.remove("hidden");
        const ahead = s.ghostDelta >= 0;
        const label = `👻 ${ahead ? "+" : ""}${Math.round(s.ghostDelta)}m`;
        if (this.ghostChip.textContent !== label) this.ghostChip.textContent = label;
        this.ghostChip.classList.toggle("ahead", ahead);
        this.ghostChip.classList.toggle("behind", !ahead);
      }

      const day = Math.min(1, s.daylight / s.daylightMax);
      const dayPct = Math.round(day * 100);
      if (dayPct !== this.live.sun) {
        this.live.sun = dayPct;
        this.sunFill.style.width = `${Math.max(2, dayPct)}%`;
        this.sunKnob.style.left = `${dayPct}%`;
      }
      const low = day < 0.28;
      if (low !== this.live.sunLow) {
        this.live.sunLow = low;
        this.sunFill.classList.toggle("low", low);
      }

      this.feverWrap.classList.toggle("on", s.feverOn);
      const feverPct = Math.round(Math.max(0, Math.min(1, s.fever)) * 100);
      if (feverPct !== this.live.fever) {
        this.live.fever = feverPct;
        this.feverFill.style.width = `${feverPct}%`;
      }

      // Only environment states live here; timed power-ups have their own
      // labeled rail, so they are no longer duplicated in two places.
      const chips: string[] = [];
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
      const speedPct = Math.round(Math.max(0, (s.speedNorm - 0.55) * 1.6) * 100);
      if (speedPct !== this.live.speed) {
        this.live.speed = speedPct;
        this.speedLines.style.opacity = String(speedPct / 100);
      }

      // altitude gauge (log-ish so low hops still read, big launches still climb)
      const aN = Math.min(1, Math.pow(s.altitude / 340, 0.65));
      const altPct = Math.round(aN * 1000) / 10;
      if (altPct !== this.live.altFill) {
        this.live.altFill = altPct;
        this.altFill.style.height = `${altPct}%`;
        this.altBird.style.bottom = `calc(${altPct}% - 9px)`;
      }
      const altMetres = Math.round(s.altitude);
      if (altMetres !== this.live.altRead) {
        this.live.altRead = altMetres;
        this.altRead.textContent = `${altMetres} m`;
      }
      if (s.altZone !== this.live.altZone) {
        this.live.altZone = s.altZone;
        this.altGauge.dataset.zone = String(s.altZone);
      }

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
              `<span class="pu" title="${p.label}"><i>${p.icon}</i><b style="width:${Math.max(0, Math.min(1, p.time / p.total)) * 100}%"></b><u>${Math.ceil(p.time)}</u></span>`,
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

      // Top-of-screen bird roster: every pilot in the race as a live pip.
      const showRoster = s.roster.length > 0;
      this.rosterBar.classList.toggle("hidden", !showRoster);
      if (showRoster) {
        const rkey = s.roster.map((r) => `${r.id}${Math.round(r.progress * 90)}${r.emote}`).join("|");
        if (rkey !== this.lastRoster) {
          this.lastRoster = rkey;
          const leader = s.roster[0];
          this.rosterBar.innerHTML =
            `<div class="roster-track">${s.roster
              .map(
                (r) => `<span class="rb ${r.you ? "you" : ""} ${r.remote ? "remote" : ""} ${r.finished ? "done" : ""}"
                  style="left:${(r.progress * 100).toFixed(1)}%;--h:${Math.round(r.hue * 360)}"
                  title="${escapeHtml(r.name)}">${r.emote ? `<b class="rb-emote">${r.emote}</b>` : ""}</span>`,
              )
              .join("")}</div>` +
            `<div class="roster-meta"><span class="rm-lead">👑 ${escapeHtml(leader ? leader.name : "—")}</span>` +
            `<span class="rm-count">${s.roster.length} birds</span>` +
            `${s.roomCode ? `<span class="rm-room">ROOM ${escapeHtml(s.roomCode)}</span>` : ""}` +
            `<span class="rm-net ${s.netState}">${s.multiplayerLive ? s.netState : "solo field"}</span></div>`;
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

      // Live 40-bird standings ticker.
      this.standingsEl.classList.toggle("hidden", s.standings.length === 0);
      if (s.standings.length) {
        const key = s.standings.map((r) => `${r.id}${r.place}${Math.round(r.distance / 4)}`).join("|");
        if (key !== this.lastStandings) {
          this.lastStandings = key;
          this.standingsEl.innerHTML = s.standings
            .map(
              (r) => `<div class="st-row ${r.you ? "you" : ""} ${r.kind === "remote" ? "remote" : ""}">
                <span class="st-p">${r.place}</span>
                <span class="st-n">${escapeHtml(r.name)}${r.kind === "remote" ? " ⇄" : ""}</span>
                <span class="st-d">${Math.round(r.distance)}m</span>
              </div>`,
            )
            .join("");
        }
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
    this.skyResize.disconnect();
    this.menuSky.dispose();
    this.root.remove();
  }

  private renderStatic(s: HudSnapshot): void {
    if (s.state === "menu" || (s.state === "gameover" && s.screen !== "main")) {
      this.menuCard.className = `paper-card ${s.screen === "shop" || s.screen === "pass" ? "wide" : ""}`;
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

  const rows =
    page && page.entries.length
      ? page.entries
          .map(
            (e, i) => `<div class="board-row ${e.you ? "you" : ""}">
              <span class="bp">${i + 1}</span>
              <span class="bn">${escapeHtml(e.name)}</span>
              <span class="bv">${fmt(e.value)}</span>
            </div>`,
          )
          .join("")
      : `<div class="board-row empty">${s.boardLoading ? "Loading…" : "No flights recorded yet"}</div>`;

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
        : "No leaderboard server is configured, so rankings are stored on this device only. Set VITE_LEADERBOARD_URL to go worldwide."
    }</p>
  `;
}

function renderLive(s: HudSnapshot): string {
  const status = s.multiplayerLive
    ? s.netState === "racing" || s.netState === "lobby"
      ? `<span class="board-badge live">Connected</span>`
      : s.netState === "connecting"
        ? `<span class="board-badge warn">Connecting…</span>`
        : `<span class="board-badge warn">${escapeHtml(s.netError || "Offline")}</span>`
    : `<span class="board-badge local">Practice field</span>`;

  return `
    ${head("Match Race", "back", status)}
    <p class="tagline">A 40-bird grid on today's hills. Beat the pack's pace and learn slipstream lines.</p>

    <button class="primary-btn race40" data-ui data-action="quick-match">⚡ Quick match</button>

    <div class="section-title">Friend room</div>
    <div class="sheet">
      <div class="code-row">
        <span>${s.roomCode ? `Your room: <b>${escapeHtml(s.roomCode)}</b>` : "Host a room and share the code"}</span>
        <button class="mini-btn gold" data-ui data-action="host-room">Host</button>
      </div>
      <div class="redeem">
        <input data-ui data-ref="roomCode" maxlength="5" placeholder="CODE" autocomplete="off" style="text-transform:uppercase" />
        <button class="mini-btn" data-ui data-action="join-room">Join</button>
      </div>
      ${s.roomCount > 0 ? `<p class="note">${s.roomCount} / ${s.roomCapacity} birds in room</p>` : ""}
    </div>

    <div class="section-title">How the pack works</div>
    <div class="field-guide">
      <div class="fg-row"><b>🌀 Slipstream</b> Tuck in just behind another bird to cut drag. <em>Hunt, draft, then break out.</em></div>
      <div class="fg-row"><b>👑 Roster bar</b> Every bird appears along the top. Yours is gold.</div>
      <div class="fg-row"><b>👋 Emotes</b> Tap an emote to taunt the pack mid-flight.</div>
      <div class="fg-row"><b>📸 Photo finish</b> Cross within a wing-length and the game names your rival.</div>
    </div>

    ${s.nemesis ? `<div class="reward-strip nest">Rival: <b>${escapeHtml(s.nemesis)}</b> beat you last race — settle it.</div>` : ""}
    <p class="fineprint">${
      s.multiplayerLive
        ? "Connected to the race service. Finish order is decided by the server."
        : "No race service is configured, so the 40-bird field is simulated locally. These are practice bots, not live players."
    }</p>
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

const MODE_TAGS: Record<string, { tag: string; reward: string }> = {
  daytrip: { tag: "Solo · endless", reward: "Unlocks islands, coins and Nest levels" },
  race: { tag: "Solo · timed", reward: "Best race time saved on this device" },
  zenith: { tag: "Solo · score attack", reward: "Feeds altitude records and cups" },
  distance: { tag: "Solo · timed", reward: "Best distance saved on this device" },
  coinrush: { tag: "Solo · timed", reward: "Fast coin farming for the shop" },
  perfect: { tag: "Solo · skill", reward: "Trains launch timing; scores cups" },
  endless: { tag: "Solo · escalating", reward: "Highest score ceiling for veterans" },
  massrace: { tag: "Practice grid · local", reward: "Rivals are simulated birds, not players" },
};

function renderModes(s: HudSnapshot): string {
  return `
    ${head("Game modes")}
    <p class="tagline">Every mode runs on the same hills and shares your unlocks. Pick the pressure you want.</p>
    <div class="mode-list">
      ${s.modes
        .map((m) => {
          const meta = MODE_TAGS[m.id] ?? { tag: "Solo", reward: "Shares your progression" };
          return `<button class="mode-card ${m.id === s.modeId ? "on" : ""}" data-ui data-action="pick-mode" data-id="${m.id}">
            <span class="mode-icon">${m.icon}</span>
            <span class="mode-body">
              <b>${m.name}<span class="mode-tag">${meta.tag}</span></b>
              <em>${m.blurb}</em>
              <i class="mode-reward">${meta.reward}</i>
            </span>
            <span class="mode-meta">${m.finish ? `${m.finish / 1000} km` : m.clock ? `${m.clock}s` : "∞"}</span>
          </button>`;
        })
        .join("")}
    </div>
    <button class="soft-btn wide" data-ui data-action="versus">👥 Local 2-player race (same device)</button>
    <p class="fineprint">Progress is stored on this device. Nothing here competes with live players.</p>
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

/**
 * One compact objectives block instead of three stacked lists. The menu was
 * previously the longest screen in the game; this keeps the single open loop
 * visible without burying the primary call to action.
 */
function renderObjectives(s: HudSnapshot): string {
  const rows: string[] = [];
  let lead: SessionGoal | null = null;
  for (const g of s.sessionGoals) {
    if (g.done) continue;
    if (!lead || g.progress / g.target > lead.progress / lead.target) lead = g;
  }
  if (lead) {
    rows.push(
      `<div class="obj"><span class="obj-k">Goal</span><span class="obj-t">${escapeHtml(lead.label)}</span><span class="obj-v">${Math.min(lead.progress, lead.target)}/${lead.target}</span></div>`,
    );
  }
  const quest = s.quests.find((q) => !q.claimed);
  if (quest) {
    rows.push(
      `<div class="obj"><span class="obj-k">Daily</span><span class="obj-t">${escapeHtml(quest.def.label)}</span><span class="obj-v">● ${quest.def.reward}</span></div>`,
    );
  }
  const mission = s.missions.find((m) => !m.done);
  if (mission) {
    rows.push(
      `<div class="obj"><span class="obj-k">Nest</span><span class="obj-t">${mission.def.desc}</span><span class="obj-v">${Math.min(mission.progress, mission.def.target)}/${mission.def.target}</span></div>`,
    );
  }
  if (rows.length === 0) return "";
  return `<div class="objectives">${rows.join("")}</div>`;
}

function renderMain(s: HudSnapshot): string {
  const portal = s.portalName !== "none";
  const seedOptions: { id: SeedMode; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "yesterday", label: "Yesterday" },
    { id: "random", label: "Wild" },
  ];
  const seedPicker = portal
    ? `<p class="portal-note">${s.portalName === "poki" ? "Poki" : "CrazyGames"} edition · portal rewards enabled</p>`
    : s.gold
      ? `<div class="seg">${seedOptions
          .map((m) => `<button data-ui data-action="seed-${m.id}" class="${s.seedMode === m.id ? "on" : ""}">${m.label}</button>`)
          .join("")}</div>`
      : `<button class="lock-chip" data-ui data-action="open-paywall">🔒 Choose your hills with Gold</button>`;

  const best = formatDistance(s.bestDistance);
  const today = formatDistance(s.todayBest);

  return `
    <div class="brand">
      <div class="logo-mark">✶</div>
      <h1>SUNBIRD</h1>
      <p class="tagline">Hold to dive. Release to soar. Reach the next island before the sun goes down.</p>
    </div>
    <p class="seed">${s.seedLabel}</p>
    ${seedPicker}
    <button class="primary-btn hero" data-ui data-action="start">
      <span class="hero-label">Take flight</span>
      <span class="hero-hint">hold anywhere</span>
    </button>
    <div class="how">
      <span><b>HOLD</b> dive &amp; build speed</span>
      <span class="dot"></span>
      <span><b>RELEASE</b> at the crest to launch</span>
    </div>
    ${
      s.firstRun
        ? `<div class="firstrun"><b>First flight?</b> Chain downhills to stay fast — the sun meter is your clock.</div>`
        : ""
    }
    <div class="stat-strip">
      <div><span>Best</span><b>${best}</b></div>
      <div><span>Today</span><b>${today}</b></div>
      <div><span>Streak</span><b>${s.streakDays}d</b></div>
      <div><span>Nest</span><b>×${s.nestMult.toFixed(2)}</b></div>
    </div>
    <div class="menu-grid">
      <button class="tile" data-ui data-action="mode-select"><span class="tile-icon">🎯</span><span class="tile-body"><b>Game modes</b><em>Race, Zenith, Coin Rush…</em></span></button>
      <button class="tile" data-ui data-action="versus"><span class="tile-icon">👥</span><span class="tile-body"><b>2 Player</b><em>Local split screen</em></span></button>
      <button class="tile" data-ui data-action="open-live"><span class="tile-icon">🐦</span><span class="tile-body"><b>Mass Race</b><em>40-bird practice grid</em></span></button>
      <button class="tile" data-ui data-action="open-cups"><span class="tile-icon">🏆</span><span class="tile-body"><b>Weekly cups</b><em>Local divisions</em></span></button>
    </div>
    ${renderObjectives(s)}
    ${
      !portal && s.vipExpiredNotice
        ? `<div class="expire-strip">♛ VIP has lapsed — the Aurora bird stays yours, perks are paused.
             <button class="mini-btn vip" data-ui data-action="vip-buy">Renew ${s.vipPrice}</button>
             <button class="mini-btn ghost" data-ui data-action="vip-dismiss">Later</button></div>`
        : ""
    }
    <div class="menu-foot">
      <span class="pill coin">● ${s.wallet}</span>
      <span class="pill skill">${s.skillLabel}</span>
      ${!portal && s.gold ? '<span class="pill gold">✦ Gold</span>' : ""}
      ${!portal && s.vip ? '<span class="pill vip">♛ VIP</span>' : ""}
    </div>
    <div class="menu-links">
      <button data-ui data-action="open-shop">Shop</button>
      <button data-ui data-action="open-pass">Pass</button>
      <button data-ui data-action="open-trophies">Trophies</button>
      <button data-ui data-action="open-board">Scores</button>
      <button data-ui data-action="open-atlas">Atlas</button>
      ${!portal && (!s.gold || !s.vip) ? '<button data-ui data-action="open-paywall">✦ Gold</button>' : ""}
      <button data-ui data-action="open-account">Account</button>
      <button data-ui data-action="open-settings" aria-label="Settings">Settings</button>
    </div>
  `;
}

function renderSkinCard(v: SkinView, portal = false): string {
  const d = v.def;
  const swatch = `<div class="bird-swatch" style="--body:${hex(d.body)};--wing:${hex(d.wing)};--belly:${hex(d.belly)}"><i class="w"></i><i class="b"></i><i class="e"></i></div>`;
  let action: string;
  if (v.equipped) action = `<span class="tag on">Equipped</span>`;
  else if (v.owned) action = `<button class="mini-btn" data-ui data-action="equip-skin" data-id="${d.id}">Equip</button>`;
  else if (v.locked && portal)
    action = `<span class="tag portal-lock">Portal event</span>`;
  else if (v.locked)
    action = `<button class="mini-btn ${v.lockReason === "vip" ? "vip" : "gold"}" data-ui data-action="open-paywall">${v.lockReason === "vip" ? "♛ VIP" : "✦ Gold"}</button>`;
  else action = `<button class="mini-btn ${v.affordable ? "" : "off"}" data-ui data-action="buy-skin" data-id="${d.id}">● ${d.price}</button>`;
  return `<div class="skin-card ${v.equipped ? "equipped" : ""}">${swatch}<div class="sk-name">${d.name}</div><div class="sk-perk">${d.perk}</div>${action}</div>`;
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
    <div class="skin-grid">${s.skins.map((skin) => renderSkinCard(skin, s.portalName !== "none")).join("")}</div>
    <div class="section-title">Boosts <small>armed for your next flight</small></div>
    <div class="boost-list">${s.boosts.map(renderBoostRow).join("")}</div>
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
        <p class="tagline">This edition uses ${s.portalName === "poki" ? "Poki" : "CrazyGames"} portal rewards only. No direct checkout, no external ads, no paywall.</p>
        <p class="fineprint">Keep your momentum, complete missions, and earn every cosmetic through play.</p>
      </div>
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
    ${s.restoreMessage ? `<p class="note">${s.restoreMessage}</p>` : ""}
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
      ${s.checkoutError ? `<p class="error">${s.checkoutError}</p>` : ""}
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
    <p class="section-note">Audio</p>
    ${toggle("Sound Effects", "mute", !s.settings.mute)}
    <div class="setting-row"><span>SFX Volume</span><button class="mini-btn" data-ui data-action="set-sfx-vol">${s.settings.mute ? "Muted" : `${sPct}%`}</button></div>
    ${toggle("Music", "music", s.settings.music)}
    <div class="setting-row"><span>Music Volume</span><button class="mini-btn" data-ui data-action="set-music-vol">${!s.settings.music ? "Off" : `${mPct}%`}</button></div>
    <p class="section-note">Device</p>
    ${toggle("Haptics", "haptics", s.settings.haptics)}
    ${toggle("Reduce motion", "motion", s.settings.reduceMotion)}
    <div class="setting-row"><span>Render quality</span><button class="mini-btn" data-ui data-action="set-quality">${s.settings.quality.toUpperCase()}</button></div>
    ${s.canInstall ? `<button class="soft-btn wide" data-ui data-action="install-app">⬇ Install Sunbird</button>` : ""}
    <p class="section-note">Save data</p>
    <div class="setting-row"><span>Flights flown</span><b>${s.runsPlayed}</b></div>
    <button class="ghost-btn danger" data-ui data-action="reset-progress">${s.resetArmed ? "Tap again to erase everything" : "Reset progress"}</button>
    <p class="fineprint">Sunbird · ${s.seedLabel}</p>
  `;
}

function renderScores(s: HudSnapshot): string {
  return `
    ${head("High glides", "back", `<span class="pill">${s.runsPlayed} flights</span>`)}
    <p class="tagline">Your personal records, stored on this device.</p>
    <div class="stat-strip dual">
      <div><span>Best ever</span><b>${formatDistance(s.bestDistance)}</b></div>
      <div><span>Today</span><b>${formatDistance(s.todayBest)}</b></div>
    </div>
    <h3 class="table-title">Recent glides</h3>
    ${renderScoreTable(s.highScores)}
  `;
}

function rewardLabel(r: { kind: string; amount?: number; id?: string }): string {
  if (r.kind === "coins") return `● ${r.amount}`;
  if (r.kind === "skin") return `🪶 ${r.id}`;
  return `🎁 ${r.id}`;
}

function renderPass(s: HudSnapshot): string {
  const pct = Math.min(100, (s.season.have / s.season.need) * 100);
  return `
    ${head(`Nest Pass · ${s.season.label}`, "back", `<span class="pill">Lv.${s.season.tier}/${s.season.maxTier}</span>`)}
    <div class="pass-progress"><i style="width:${pct}%"></i></div>
    <p class="tagline">Fly to earn XP. Gold unlocks the premium track.</p>
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

function renderGameOver(s: HudSnapshot): string {
  if (s.versus && s.p1Stats && s.p2Stats) return renderVersusResult(s);
  const questTotal = s.claimedQuests.reduce((a, q) => a + q.reward, 0);
  const raceStrip =
    s.massRace && s.racePlace > 0
      ? `<div class="race-result ${s.racePlace === 1 ? "win" : ""}">
           <span class="rr-place">P${s.racePlace}</span>
           <span class="rr-of">of ${s.raceField} pilots</span>
           <span class="rr-time">${s.raceFinishTime.toFixed(1)}s</span>
         </div>
         ${s.photoFinish ? `<div class="reward-strip">📸 ${escapeHtml(s.photoFinish)}</div>` : ""}
         ${s.nemesis ? `<button class="soft-btn wide" data-ui data-action="race-40">🔁 Rematch — beat ${escapeHtml(s.nemesis)}</button>` : ""}`
      : "";
  const isBest = s.distance > s.prevBestDistance && s.distance > 0;
  const delta = Math.round(s.distance - s.prevBestDistance);
  const outcome = isBest
    ? s.prevBestDistance > 0
      ? `<div class="outcome best"><span class="outcome-k">New personal best</span><span class="outcome-v">+${delta} m</span></div>`
      : `<div class="outcome best"><span class="outcome-k">First flight logged</span><span class="outcome-v">${formatDistance(s.distance)}</span></div>`
    : `<div class="outcome"><span class="outcome-k">Flight over</span><span class="outcome-v">${delta} m vs your best</span></div>`;
  return `
    <div class="zzz">z z z</div>
    <h2>Sunset</h2>
    <p class="tagline">The daylight ran out — gliding speed set your final distance.</p>
    ${outcome}
    <div class="over-stats">
      <div class="primary"><span>Distance</span><b>${formatDistance(s.distance)}</b></div>
      <div class="primary"><span>Score</span><b>${Math.floor(s.score).toLocaleString()}</b></div>
      <div><span>Coins</span><b>${s.coins}</b></div>
      <div><span>Perfects</span><b>${s.perfects}</b></div>
      <div><span>Zeniths</span><b>${s.zeniths}</b></div>
      <div><span>Islands</span><b>${s.island + 1}</b></div>
    </div>
    ${s.ghostDelta !== null ? `<div class="reward-strip ${s.ghostDelta >= 0 ? "" : "nest"}">${s.ghostDelta >= 0 ? `Beat your ghost by ${Math.round(s.ghostDelta)}m! 👻` : `${Math.round(-s.ghostDelta)}m behind your best ghost`}</div>` : ""}
    ${questTotal ? `<div class="reward-strip">Daily quest${s.claimedQuests.length > 1 ? "s" : ""} complete · +${questTotal} coins</div>` : ""}
    ${s.newlyCompleted.length ? `<div class="reward-strip nest">Nest upgraded → Lv.${s.nestLevel} · ×${s.nestMult.toFixed(2)} score</div>` : ""}
    ${s.nearMiss ? `<div class="nearmiss">${s.nearMiss}</div>` : ""}
    ${raceStrip}
    <div class="reached-strip">Reached <b>${s.biomeEmoji} ${s.biomeName}</b> · Island ${s.island + 1}</div>
    <button class="primary-btn big hero" data-ui data-action="retry"><span class="hero-label">Fly again</span><span class="hero-hint">hold anywhere · R</span></button>
    <div class="btn-row">
      <button class="soft-btn wide2" data-ui data-action="mode-select">🎯 Change mode</button>
      <button class="soft-btn wide2" data-ui data-action="menu">🏠 Menu</button>
    </div>
    <button class="soft-btn wide" data-ui data-action="share" ${s.shareBusy ? "disabled" : ""}>${s.shareBusy ? "Preparing…" : "📤 Share this flight"}</button>
    ${renderGoalList(s.sessionGoals)}
    ${renderQuests(s.quests)}
    ${s.portalName === "none" && !(s.gold && s.vip) ? upsellStrip() : ""}
    <h3 class="table-title">Your best glides</h3>
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
      <div class="ad-label">${s.portalName === "poki" ? "Poki" : "CrazyGames"} break</div>
      <div class="portal-ad-wait"><div class="spinner"></div><h3>Preparing the next flight</h3><p>Your run is paused while the portal handles this break.</p></div>
    `;
  }
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
