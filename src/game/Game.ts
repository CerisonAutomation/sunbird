import * as THREE from "three";
import { Achievements } from "./Achievements";
import { GameAudio } from "./Audio";
import { BIOMES, biomeForIsland } from "./Biomes";
import { Bird, type BirdStepOpts } from "./Bird";
import { CameraRig } from "./CameraRig";
import { Collectibles, type CloudKind, type PickupKind } from "./Collectibles";
import { evaluateNearMiss, FlowTuner, SessionGoals, type NearMiss } from "./Engagement";
import { BIG_LAUNCH_QUIPS, FEVER_QUIPS, GEM_QUIPS, MILESTONE_QUIPS, SLEEP_QUIPS, SPLASH_QUIPS, SURRENDER_QUIPS, SurpriseEngine, quip } from "./Surprises";
import { Fx } from "./Fx";
import { LaunchSystem, ratingLabel, type LaunchResult } from "./LaunchSystem";
import { MASS_RACE_FIELD, MODES, modeById, RACE_FINISH, type ModeDef, type ModeId } from "./Modes";
import { MassRace } from "./MassRace";
import { FinishGate } from "./FinishGate";
import { isMultiplayerConfigured, makeRoomCode, RealtimeClient } from "./Realtime";
import { Leaderboard, loadPilotName, savePilotName, isLeaderboardOnline, type BoardMetric, type BoardPage, type BoardScope } from "./Leaderboard";
import { Tournaments, TRAILS, weekKey, type PrizeGrant } from "./Tournaments";
import {
  dailyChallenge,
  dailyDone,
  modsFor,
  NO_MODS,
  stageDone,
  weeklyGauntlet,
  calendarReward,
  calendarRewardLabel,
  CALENDAR_DAYS,
  type ChallengeMods,
} from "./Challenges";
import { bankMasteryRun, masteryPerks, masteryViews, NO_MASTERY_PERKS, type MasteryPerks } from "./Mastery";
import { FirstFlight } from "./FirstFlight";
import { campaignProgress, campaignViews, CAMPAIGN } from "./Campaign";
import { monthKey, monthlyTheme, THEME_TRAIL_CLEARS, weeklyEvent } from "./Events";
import { emptySquadState, SquadClient } from "./Squad";
import { PowerUps } from "./PowerUps";
import { Racer } from "./Racer";
import {
  ALT_CLOUDS,
  ALT_HIGH,
  ALT_SKY,
  ALT_STRATO,
  BIRD_RADIUS,
  BOOST_TIME,
  CLOUD_BONUS,
  LAND_PERFECT,
  COIN_VALUE,
  CONTINUE_COST,
  CONTINUE_DAYLIGHT,
  CONTINUE_TIMEOUT,
  DAYLIGHT_ISLAND_REFILL,
  DAYLIGHT_MAX,
  DAYLIGHT_MAX_GOLD,
  DAYLIGHT_OCEAN_PENALTY,
  FEVER_DURATION,
  FEVER_NEED,
  HEADSTART_DISTANCE,
  MAGNET_TIME,
  PHYS_DT,
  PICKUP_SUN_TIME,
  REFERRAL_BONUS,
  WATER_Y,
  ZENITH_ALT,
  ZENITH_DURATION,
  ZENITH_SLOWMO,
} from "./constants";
import { BOOSTS, COLLECTIONS, GOLD, PROMO_CODES, SHOP_TRAILS, SKINS, STARTER_PACK, VIP, dailyDealBoost, skinById, type BoostView, type ShopTrailView, type SkinDef, type SkinView } from "./Economy";
import { GhostPlayer, GhostRecorder } from "./Ghost";
import { HUD, type CalendarCard, type CheckoutMode, type DailyCard, type GauntletCard, type HudSnapshot, type LoadoutView, type RivalCard, type SeedMode, type UiScreen, type UiState } from "./HUD";
import { divisionFor, duelOpponent, duelSkillFor, featuredRivals, nextDivision, seasonReward } from "./pvp";
import { Input } from "./Input";
import { clamp, dateSeed, formatDatePretty, lerp } from "./math";
import { Missions, type MissionView, type QuestReward, type QuestView, type RunStats } from "./Missions";
import { ParticleFX } from "./ParticleFX";
import { TrailRibbon } from "./Trail";
import {
  consumeStripeReturn,
  ensureStripeJs,
  MockAdProvider,
  MockPaymentProvider,
  stripeConfigured,
  stripeLinkFor,
  type AdProvider,
  type Sku,
} from "./Payments";
import { SaveData } from "./SaveData";
import { SeasonPass, seasonId, seasonLabel, XP_RULES } from "./SeasonPass";
import { buildShareCard, shareOrDownload } from "./Social";
import { buildChallengeUrl, readChallengeFromUrl, type RivalChallenge } from "./Challenge";
import { buildRoomInviteUrl, normalizeRoomCode, readRoomInviteFromUrl } from "./RoomInvite";
import { initPlatform, isPortalBuild, portalTarget, type PlatformAdapter } from "../sdk/platform";
import { LivingBackground } from "./LivingBackground";
import { Sky } from "./Sky";
import { Telemetry } from "./Telemetry";
import { TerrainSystem } from "./TerrainSystem";
import { Weather } from "./Weather";

export type GameState = UiState;
type AdReason = "continue" | "interstitial";

function hsl(h: number, s: number, l: number): [number, number, number] {
  const c = new THREE.Color().setHSL(h, s, l);
  return [c.r, c.g, c.b];
}

const ASLEEP: BirdStepOpts = { diving: false, fever: false, speedMult: 1, boost: false };

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> };

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly save: SaveData;
  private readonly missions: Missions;
  private readonly achievements: Achievements;
  private readonly seasonPass: SeasonPass;
  private readonly input: Input;
  private readonly audio: GameAudio;
  private readonly hud: HUD;
  private readonly bird: Bird;
  private readonly camera: CameraRig;
  private readonly particles: ParticleFX;
  private readonly trail: TrailRibbon;
  private readonly fx: Fx;
  private readonly isMobile: boolean;
  private useBloom = false;
  private readonly sky: Sky;
  private readonly mockPayments = new MockPaymentProvider();
  private readonly ads: AdProvider = new MockAdProvider();
  private platform: PlatformAdapter | null = null;
  private readonly telemetry = new Telemetry();
  private readonly ghostRecorder = new GhostRecorder();
  private readonly ghostPlayer = new GhostPlayer();
  private readonly livingBg = new LivingBackground();
  private terrain: TerrainSystem;
  private collect: Collectibles;
  private weather: Weather;
  private today = dateSeed();
  private seed: string;
  private seedMode: SeedMode = "today";

  private state: GameState = "menu";
  private screen: UiScreen = "main";
  private uiVersion = 0;
  private viewsVersion = -1;
  private missionViews: MissionView[] = [];
  private questViews: QuestView[] = [];
  private skinViews: SkinView[] = [];
  private boostViews: BoostView[] = [];
  private shopTrailViews: ShopTrailView[] = [];

  private raf = 0;
  private acc = 0;
  private last = 0;
  private elapsed = 0;
  private runTime = 0;
  private disposed = false;
  private hidden = false;
  private timeScale = 1;
  private zenithTimer = 0;
  private hitStopTimer = 0;
  private frameEma = 1 / 60;
  private qualityTimer = 0;
  private dpr = 1;
  private particleBudget = 1;
  private deferredInstall: BeforeInstallPromptEvent | null = null;
  private readonly onBeforeInstall: (e: Event) => void;
  private readonly onInstalled: () => void;

  private daylight = DAYLIGHT_MAX;
  private startX = 64;
  private island = 0;
  private lastIsland = 0;
  private perfects = 0;
  private perfectChain = 0;
  private feverTimer = 0;
  private feverOn = false;
  private feverReached = false;
  private prevVy = 0;
  private bonus = 0;
  private scoreAccum = 0;
  private splashCd = 0;
  private hintTimer = 0;
  private hint = "";
  private runCoins = 0;
  private runClouds = 0;
  private zeniths = 0;
  private pickups = 0;
  private magnetTimer = 0;
  /** Ridge-skim flow: seconds spent hugging the terrain at speed. */
  private skimTime = 0;
  private skimCd = 0;
  /** Rare delightful mid-run events (comedy + windfalls). */
  private readonly surprises = new SurpriseEngine();
  private splashQuipN = 0;
  private shield = 0;
  private boostTimer = 0;
  private continuesUsed = 0;
  private continueTimer = 0;
  private adTimer = 0;
  private adReason: AdReason = "interstitial";
  private skipInterstitialOnce = false;
  private runRecorded = false;
  private newlyCompleted: string[] = [];
  private claimedQuests: QuestReward[] = [];
  private menuHold = 0;
  private needRelease = false;
  private ghostWasAhead = false;
  private ghostPassed = false;
  private readonly launch = new LaunchSystem();
  private readonly massRace = new MassRace();
  private readonly finishGate = new FinishGate();
  private finishRemaining = -1;
  private readonly board: Leaderboard;
  private readonly cups: Tournaments;
  private pilotName = "";
  private boardScope: BoardScope = "global";
  private boardMetric: BoardMetric = "distance";
  private boardPage: BoardPage | null = null;
  private boardLoading = false;
  private lastPrize: PrizeGrant | null = null;
  private racePlace = 0;
  private raceField = 0;
  private raceFinishTime = 0;
  private net: RealtimeClient | null = null;
  private roomCode = "";
  /** Room invite (#room=) pending application on the first frame. */
  private pendingRoomInvite = "";
  private roomSize = 40;
  private roomSkill: "chill" | "sharp" | "ace" = "sharp";
  private roomMuted = false;
  private lastEmoteAt = 0;
  private draftBanner = 0;
  /** Rival tracking: who beat you last time, for the revenge prompt. */
  private nemesis = "";
  private photoFinish = "";
  private rankedRace = true;
  private lastRatingDelta = 0;
  private lastRatingBonus = 0;
  private lastPlace = 0;
  private overtakeAcc = 0;
  /** Ranked 1v1 duel: one seeded opponent, flat ±16 rating swing. */
  private duelActive = false;
  /** Matchmaking search deadline (wall-clock ms; 0 = not searching). Wall
   *  clock, not frame dt — frame time is capped at 100 ms, so on slow
   *  devices an accumulated-dt countdown runs slower than real time. */
  private mmDeadline = 0;
  /** Deferred launch options for when the search resolves. */
  private mmOpts: { ranked: boolean; storm: boolean } | null = null;
  /** The last launched match's options — powers the one-tap Rematch button. */
  private lastMatchOpts: { ranked: boolean; storm: boolean } | null = null;
  /** Stormfront mode: PvE hazards×PvP race hybrid — everyone flies the gauntlet. */
  private stormfront = false;
  /** Stormfront phase (1-3): the storm escalates as the field advances. */
  private stormPhase = 1;
  /** Golden Hour: the last stretch of daylight — 2× coins, amber world. */
  private goldenHour = false;
  private nextMilestone = 500;
  private rivalBeatenToast = false;
  /** True once the DO's official finish place has been folded in this race. */
  private serverPlaceApplied = false;
  private duelResult: "" | "won" | "lost" = "";
  private duelDelta = 0;
  /** Which challenge (if any) the current run is flying under. */
  private challengeRun: "" | "daily" | `gauntlet${number}` = "";
  private challengeMods: ChallengeMods = NO_MODS;
  /** End-of-run outcome line for the challenge strip on the results card. */
  private challengeOutcome = "";
  /** Incoming rival challenge (#rival= link): fly their seed, beat their mark. */
  private rival: RivalChallenge | null = null;
  private rivalResult: "" | "won" | "lost" = "";
  /** Weekly live event: current run flies under the event modifiers. */
  private eventRun = false;
  /** Squad (friends/clubs/chat) client + last action notice. */
  private squad: SquadClient | null = null;
  private squadNotice = "";
  private squadPoll = 0;
  private readonly flow = new FlowTuner();
  private readonly goals: SessionGoals;
  private nearMiss: NearMiss = { kind: "none", gap: 0, text: "" };
  private goalPop = "";
  private goalPopT = 0;
  private recordBanner = "";
  /** Previous personal-best distance, captured at run start (for the record loop). */
  private bestAtStart = 0;
  private distanceRecordCrossed = false;
  private newBest = false;
  private runGems = 0;
  private runRings = 0;
  private ringChain = 0;
  private ringChainTimer = 0;
  private runBalloons = 0;
  private runSunflowers = 0;
  private readonly powers = new PowerUps();
  private coach: FirstFlight | null = null;
  private mode: ModeDef = modeById("daytrip");
  private modeId: ModeId = "daytrip";
  /** Permanent per-mode mastery perks (coin/daylight/fever/lift), refreshed each run. */
  private masteryPerk: MasteryPerks = NO_MASTERY_PERKS;
  private maxAltitude = 0;
  private maxSpeed = 0;
  private lastLaunch: LaunchResult | null = null;
  private launchBannerT = 0;
  private launchBannerText = "";
  private countdown = 0;
  private versus = false;
  private p2: Racer | null = null;
  private p1: Racer | null = null;
  private versusWinner = 0;
  private versusGrace = 5;
  private altZone = 0;
  private readonly tmpSize = new THREE.Vector2();
  private readonly tmpColor = new THREE.Color();
  private vipActive = false;
  private vipExpiredNotice = false;
  private dayTimer = 0;
  private pendingXp = 0;
  private xpFlush = 0;
  private thermalEmitAcc = 0;
  private windEmitAcc = 0;
  private trailFxAcc = 0;
  private powerFxAcc = 0;
  private atmosphereFxAcc = 0;
  private hueT = 0;
  private lastBiomeId = "";
  private readonly onFocus: () => void;

  private checkoutSku: Sku = "sunbird_gold";
  private checkoutBusy = false;
  private checkoutError = "";
  private checkoutOk = false;
  private checkoutWaiting = false;
  private restoreMessage = "";
  private referralMessage = "";
  private cloudMessage = "";
  private shareBusy = false;
  private resetArmed = false;
  private resetTimer = 0;

  private readonly resizeObs: ResizeObserver;
  private readonly onVis: () => void;
  private readonly onResize: () => void;
  private readonly loop: (t: number) => void;

  constructor(private readonly host: HTMLElement) {
    this.save = new SaveData();
    this.flow.load(this.save);
    this.goals = new SessionGoals(this.flow);
    this.missions = new Missions(this.save);
    this.achievements = new Achievements(this.save);
    this.seasonPass = new SeasonPass(this.save);
    this.board = new Leaderboard(this.save.state.deviceId);
    this.telemetry.bindDevice(this.save.state.deviceId);
    this.cups = new Tournaments(this.save.state.tournaments);
    this.pilotName = this.save.state.pilotName || loadPilotName(this.save.state.deviceId);
    this.save.state.pilotName = this.pilotName;
    if (this.cups.rollover()) this.save.persist();
    // Ranked season rollover can also land between sessions.
    const seasonEnd = this.save.ensureRankSeason();
    this.seed = this.today;
    this.squad = new SquadClient(this.save.state.deviceId, () => this.pilotName);
    this.squad.setOnChange(() => this.bump());

    host.classList.add("game-root");
    const canvas = document.createElement("canvas");
    canvas.className = "game-canvas";
    host.appendChild(canvas);

    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    this.isMobile = isMobile;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !isMobile,
      powerPreference: isMobile ? "low-power" : "high-performance",
      stencil: false,
      alpha: false,
      premultipliedAlpha: true,
      failIfMajorPerformanceCaveat: true,
    });
    this.renderer.setClearColor(0x87c8ee, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.dpr = this.preferredDpr();
    this.renderer.setPixelRatio(this.dpr);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x8ed0ee, 62, 380);

    this.hud = new HUD(host);
    this.input = new Input(host, () => {
      void this.audio.resume();
    });
    this.audio = new GameAudio();

    this.terrain = new TerrainSystem(this.seed);
    this.scene.add(this.terrain.group);

    this.bird = new Bird();
    this.bird.addTo(this.scene);
    this.ghostPlayer.addTo(this.scene);
    this.scene.add(this.livingBg);

    this.camera = new CameraRig(1);
    this.particles = new ParticleFX();
    this.particles.addTo(this.scene);
    this.trail = new TrailRibbon();
    this.trail.addTo(this.scene);
    this.fx = new Fx(this.renderer, this.scene, this.camera.camera);
    this.sky = new Sky();
    this.scene.add(this.sky.group);
    this.sky.addLights(this.scene);

    this.collect = new Collectibles(this.terrain.seedN);
    this.scene.add(this.collect.group);
    this.weather = new Weather(this.terrain.seedN);
    this.weather.addTo(this.scene);
    this.massRace.addTo(this.scene);
    this.finishGate.addTo(this.scene);

    this.applySkin();
    this.applySettings();
    this.resetRun(true);
    this.camera.setIntro(1);
    this.audio.setMusicMode("menu");

    // Rival links: #rival=seed.distance.name → same hills, their mark.
    const rival = readChallengeFromUrl();
    if (rival) {
      this.rival = rival;
      this.rebuildWorld(rival.seed);
      this.seedMode = "random";
      this.hud.toast(`🥊 ${rival.name} challenged you: beat ${rival.distance} m on their hills`, "quest");
      this.telemetry.track("rival_received", { distance: rival.distance });
    }

    // Room invite links: #room=CODE → seat straight into that private room.
    // Only honored when a realtime server is configured (portals ship none).
    const roomInvite = isMultiplayerConfigured() ? readRoomInviteFromUrl() : null;
    if (roomInvite) {
      this.roomCode = roomInvite;
      this.pendingRoomInvite = roomInvite;
    }

    this.onFocus = () => {
      if (this.checkoutWaiting && this.screen === "checkout") {
        this.telemetry.track("stripe_return_focus", { sku: this.checkoutSku });
        this.hud.toast("Welcome back — confirm below if you finished paying", "info");
      }
    };
    window.addEventListener("focus", this.onFocus);

    this.hud.onAction((action, id) => this.handleAction(action, id));
    this.onResize = () => this.resize();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    window.addEventListener("resize", this.onResize);
    this.onVis = () => {
      if (document.hidden) {
        this.hidden = true;
        if (this.state === "playing") this.setState("paused");
        // Portal QA requirement (and basic courtesy): a hidden tab is silent.
        this.audio.setHiddenMuted(true);
      } else {
        this.hidden = false;
        this.last = performance.now();
        this.acc = 0;
        this.audio.setHiddenMuted(false);
      }
    };
    document.addEventListener("visibilitychange", this.onVis);
    this.onBeforeInstall = (e) => {
      e.preventDefault();
      this.deferredInstall = e as BeforeInstallPromptEvent;
      this.bump();
    };
    this.onInstalled = () => {
      this.deferredInstall = null;
      this.bump();
    };
    window.addEventListener("beforeinstallprompt", this.onBeforeInstall);
    window.addEventListener("appinstalled", this.onInstalled);

    this.loop = (t) => this.frame(t);
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);

    this.goals.reset(this.today);
    this.terrain.setDifficulty(this.flow.difficulty());
    // Stripe.js is only fetched when the paywall actually opens — no third-
    // party network chatter (or console noise) during normal play.
    this.handleStripeReturn();
    // monthly VIP really lapses — surface it once per session
    this.vipActive = this.save.isVipActive();
    if (this.save.state.vip === false && this.save.state.vipUntil > 0) this.vipExpiredNotice = true;

    const yesterday = dateSeed(new Date(Date.now() - 86400000));
    const streakReward = this.save.touchStreak(this.today, yesterday);
    const vipGift = this.save.claimVipDaily(this.today);
    window.setTimeout(() => {
      if (this.disposed) return;
      if (streakReward > 0) this.hud.toast(`Day ${this.save.state.streak.days} streak · +${streakReward} coins`, "gold");
      if (vipGift > 0) this.hud.toast(`VIP daily gift · +${vipGift} coins`, "vip");
    }, 700);
    this.telemetry.track("session_start", {
      gold: this.save.state.gold,
      vip: this.save.isVipActive(),
      runs: this.save.state.runsPlayed,
      streak: this.save.state.streak.days,
    });
    // Portal SDK initialization is intentionally late: the first interactive
    // menu frame should never wait on a third-party CDN.
    void initPlatform({
      onAdOpened: () => this.beginPortalAd(),
      onAdClosed: () => this.endPortalAd(),
    }).then((adapter) => {
      if (this.disposed) return;
      this.platform = adapter;
      adapter.loadingFinished();
      if (this.state === "playing") adapter.gameplayStart();
      this.telemetry.track("portal_ready", { portal: adapter.name });
      this.bump();
    });
    if (seasonEnd) this.hud.toast(`⚔ Ranked season over · ${seasonEnd.division} reward +${seasonEnd.coins} coins`, "gold");
    // Warm the embedded main-menu leaderboard on boot so it isn't empty on
    // the first frame (serves the cache first, so this never blocks paint).
    void this.refreshBoard();
    this.bump();
    this.pushHud();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVis);
    window.removeEventListener("beforeinstallprompt", this.onBeforeInstall);
    window.removeEventListener("appinstalled", this.onInstalled);
    window.removeEventListener("focus", this.onFocus);
    this.weather.dispose();
    this.net?.disconnect();
    this.massRace.dispose();
    this.finishGate.dispose();
    this.input.dispose();
    this.audio.dispose();
    this.hud.dispose();
    this.terrain.dispose();
    this.bird.dispose();
    this.particles.dispose();
    this.trail.dispose();
    this.fx.dispose();
    this.sky.dispose();
    this.collect.dispose();
    this.p1?.dispose(this.scene);
    this.p2?.dispose(this.scene);
    this.p1 = null;
    this.p2 = null;
    this.renderer.dispose();
    this.host.replaceChildren();
  }

  /* ------------------------------------------------------------------ loop */

  private frame(now: number): void {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    try {
    const raw = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.hidden) return;

    this.handleHotkeys();
    this.pumpNetwork(raw);
    this.pumpMatchmaking(raw);
    this.dayTick(raw);
    this.adaptQuality(raw);
    // A #room= invite applies once the shell is live: open the lobby already
    // seated in that room so the guest sees the host before committing.
    if (this.pendingRoomInvite && this.state === "menu") {
      const code = this.pendingRoomInvite;
      this.pendingRoomInvite = "";
      this.roomCode = code;
      this.setScreen("live");
      this.preseatLobby();
      this.hud.toast(`🎟 Invited to room ${code} — press START to fly`, "gold");
      this.telemetry.track("room_invite_opened", { room: code });
    }
    // Club chat: light polling only while the Squad screen is on screen.
    if (this.screen === "squad" && this.state === "menu" && this.squad?.live) {
      this.squadPoll += raw;
      if (this.squadPoll >= 4) {
        this.squadPoll = 0;
        void this.squad.pollChat(false);
      }
    }
    // Hit stop: freeze time for cinematic impact on perfect launches.
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= raw;
      this.elapsed += raw;
      this.input.pollGamepads();
      this.render(raw, raw);
      this.pushHud();
      return;
    }
    if (this.resetArmed) {
      this.resetTimer -= raw;
      if (this.resetTimer <= 0) {
        this.resetArmed = false;
        this.bump();
      }
    }

    if (this.zenithTimer > 0) {
      this.zenithTimer -= raw;
      if (this.zenithTimer <= 0) this.timeScale = 1;
    }
    const simDt = raw * this.timeScale;

    switch (this.state) {
      case "menu":
        this.menuTick(raw);
        break;
      case "playing":
        if (this.countdown > 0) {
          const before = Math.ceil(this.countdown - 1);
          this.countdown -= raw;
          const after = Math.ceil(this.countdown - 1);
          if (after !== before) this.audio.chirp();
          if (this.countdown <= 0) this.audio.island();
          break;
        }
        this.acc += simDt;
        while (this.acc >= PHYS_DT && this.state === "playing") {
          if (this.versus) this.versusTick(PHYS_DT);
          else this.fixedUpdate(PHYS_DT);
          this.acc -= PHYS_DT;
        }
        break;
      case "continue":
        this.acc += raw;
        while (this.acc >= PHYS_DT) {
          this.bird.step(PHYS_DT, ASLEEP, this.terrain);
          this.acc -= PHYS_DT;
        }
        this.continueTimer -= raw;
        if (this.continueTimer <= 0) this.finishRun();
        break;
      case "ad":
        this.adTimer -= raw;
        break;
      case "gameover":
        this.acc += raw;
        while (this.acc >= PHYS_DT) {
          this.bird.step(PHYS_DT, ASLEEP, this.terrain);
          this.acc -= PHYS_DT;
        }
        if (this.screen === "main") this.holdToStart(raw, 0.12);
        break;
      default:
        break;
    }

    this.elapsed += raw;
    if (this.launchBannerT > 0) this.launchBannerT = Math.max(0, this.launchBannerT - raw);
    if (this.goalPopT > 0) {
      this.goalPopT = Math.max(0, this.goalPopT - raw);
      if (this.goalPopT === 0) this.bump();
    }
    this.input.pollGamepads();
    this.render(simDt, raw);
    this.pushHud();
    } catch (err) {
      console.error("Sunbird frame error:", err);
    }
  }

  private menuTick(dt: number): void {
    const h = this.terrain.heightAt(this.startX);
    this.bird.x = this.startX;
    this.bird.y = h + BIRD_RADIUS;
    this.bird.vx = 6;
    this.bird.vy = 0;
    this.bird.grounded = true;
    this.bird.rotation = Math.atan(this.terrain.slopeAt(this.startX));
    if (this.screen === "main") this.holdToStart(dt, 0.18);
  }

  private holdToStart(dt: number, threshold: number): void {
    if (this.input.diving) {
      if (this.needRelease) return;
      this.menuHold += dt;
      if (this.menuHold > threshold) {
        if (this.state === "gameover" && this.portalEnabled()) void this.restartWithPortalBreak();
        else this.startRun();
      }
    } else {
      this.needRelease = false;
      this.menuHold = 0;
    }
  }

  private fixedUpdate(dt: number): void {
    const skin = this.skin;
    const diving = this.input.diving && !this.bird.asleep;
    this.magnetTimer = Math.max(0, this.magnetTimer - dt);
    this.boostTimer = Math.max(0, this.boostTimer - dt);
    this.runTime += dt;
    this.xpFlush -= dt;
    if (this.xpFlush <= 0) {
      this.xpFlush = 2;
      this.flushXp();
    }

    this.powers.tick(dt);
    this.launch.tick(dt);
    this.launch.observeInput(diving, this.runTime);

    this.bird.step(
      dt,
      {
        diving,
        fever: this.feverOn,
        speedMult: skin.speedMult * this.challengeMods.speedMult,
        boost: this.boostTimer > 0 || this.powers.boostOn(),
        liftMult: this.powers.liftMult() * this.masteryPerk.liftMult,
        // Slipstream: tucking behind a rival genuinely reduces your drag.
        dragMult: this.powers.dragMult() * this.massRace.draftFor(this.bird.x, this.bird.y),
        feather: this.powers.featherOn(),
        gravityMult: this.eventRun ? weeklyEvent().mods.gravityMult : 1,
      },
      this.terrain,
    );

    if (this.bird.justLaunched) this.onLaunch();
    if (this.bird.bounced) {
      this.bird.bounced = false;
      this.onSunflower();
    }

    // First-flight coach: verify dive -> launch -> soar with real play signals.
    if (this.coach && !this.coach.done) {
      this.coach.update(dt, {
        diving,
        grounded: this.bird.grounded,
        slope: this.terrain.slopeAt(this.bird.x),
        justLaunched: this.bird.justLaunched,
        airborne: !this.bird.grounded,
      });
      if (this.coach.done) {
        this.save.state.firstFlightDone = true;
        this.save.addCoins(50);
        this.save.persist();
        this.hud.toast("🕊 First flight complete · +50 coins — the sky is yours", "gold");
        this.particles.emitConfetti(this.bird.x, this.bird.y + 3);
      }
    }
    if (this.bird.justLanded) this.onLanding();

    this.ghostRecorder.sample(dt, this.runTime, this.bird.x, this.bird.y, this.bird.rotation);
    if (this.ghostPlayer.active) {
      const gx = this.ghostPlayer.update(this.runTime, dt);
      if (gx !== null) {
        const ahead = this.bird.x > gx + 0.5;
        if (!ahead) this.ghostWasAhead = true;
        if (ahead && this.ghostWasAhead && !this.ghostPassed && this.runTime > 4) {
          this.ghostPassed = true;
          this.save.addGhostBeat();
          for (const t of this.achievements.checkNew()) this.hud.toast(`Trophy: ${t.title}`, "gold");
          this.hud.toast("Passed your ghost! 👻", "quest");
          this.audio.ding();
          this.bonus += 30;
          this.awardXp(XP_RULES.ghostBeat);
          this.bump();
        }
      }
    }

    // biome weather: thermals, headwinds, ash storms
    this.weather.update(dt, this.elapsed, this.bird, this.terrain, diving, {
      onThermalEnter: () => {
        this.audio.thermal();
        if (this.hintTimer < 40) this.hud.toast("Thermal — release to ride it", "power");
      },
      onGustStart: () => {
        this.audio.gust();
        this.audio.duckMusic(0.2, 0.8);
      },
      onStormHit: (x, y) => {
        this.audio.storm();
        this.particles.emitAsh(x, y);
        this.shake(0.6);
        this.haptic([15, 10, 15, 10, 30]);
        this.hud.toast("Ash cloud!", "warn");
        this.perfectChain = 0;
      },
    });
    if (this.weather.inThermal) {
      this.thermalEmitAcc += dt;
      if (this.thermalEmitAcc > 0.03) {
        this.thermalEmitAcc = 0;
        this.particles.emitThermal(this.bird.x, this.bird.y - 4, 10);
      }
    }
    if (this.weather.gust > 0.3) {
      this.windEmitAcc += dt * this.weather.gust;
      if (this.windEmitAcc > 0.04) {
        this.windEmitAcc = 0;
        this.particles.emitWind(this.bird.x, this.bird.y, this.weather.gust);
      }
    }

    // The rival field runs the same fixed-step contract as the player.
    if (this.massRace.active) {
      this.massRace.step(dt, this.terrain, this.startX + this.mode.finish, this.runTime);
      // Reward the player for holding a draft: visible, audible, scoring.
      if (this.massRace.draft > 0.35) {
        this.draftBanner = Math.min(1, this.draftBanner + dt * 2);
        this.bonus += 14 * dt * this.massRace.draft;
        if (this.draftBanner > 0.98) {
          this.draftBanner = 0;
          this.particles.emitWind(this.bird.x, this.bird.y, 0.8);
        }
      } else {
        this.draftBanner = Math.max(0, this.draftBanner - dt);
      }
      // Overtake / lead-change feedback, sampled at ~4 Hz so the 41-row
      // sort never runs per physics tick.
      this.overtakeAcc += dt;
      if (this.overtakeAcc >= 0.25 && !this.bird.asleep) {
        this.overtakeAcc = 0;
        const place = this.massRace.standings(this.bird.x, this.startX, this.pilotName, 8).place;
        if (this.lastPlace > 0 && place > 0 && place < this.lastPlace) {
          const gain = this.lastPlace - place;
          this.hud.toast(place === 1 ? "👑 LEAD! Hold it!" : `P${this.lastPlace} → P${place}!`, "gold");
          if (place === 1) {
            this.flash("perfect");
            this.audio.purchase();
          } else if (gain >= 3) {
            this.audio.ding();
          }
          this.haptic(10);
        }
        this.lastPlace = place;
      }
    }

    const biomeNow = this.terrain.biomeAt(this.bird.x);
    if (biomeNow.id !== this.lastBiomeId) {
      this.lastBiomeId = biomeNow.id;
      if (this.save.markBiomeSeen(biomeNow.id)) this.hud.toast(`New shores charted: ${biomeNow.name}`, "island");
    }

    if (this.bird.inWater && this.shield > 0) {
      this.shield -= 1;
      this.bird.y = WATER_Y + 1.2;
      this.bird.vy = 30;
      this.bird.vx = Math.max(this.bird.vx, 34);
      this.bird.inWater = false;
      this.bird.grounded = false;
      this.particles.emitSplash(this.bird.x, WATER_Y);
      this.particles.burstRing(this.bird.x, this.bird.y, 0x7fe0ff);
      this.audio.shield();
      this.hud.toast("Shield bounce!", "power");
      this.shake(0.6);
      this.haptic([15, 10, 15, 10, 30]);
    }

    const slope = this.terrain.slopeAt(this.bird.x);

    this.checkZenith();
    if (this.bird.justLanded) {
      if (this.bird.impact > 5) {
        this.audio.land(this.bird.impact);
        this.shake(Math.min(0.55, this.bird.impact * 0.04));
        this.particles.emitDust(this.bird.x, this.bird.y, this.bird.speed(), slope);
      } else if (this.bird.impact < 2.4 && this.bird.speed() > 36 && diving && slope < -0.05) {
        // tangential touchdown at speed on a downslope: reward the finesse
        this.bonus += 10;
        this.audio.butter();
        this.hud.toast("Butter landing +10", "cloud");
        this.particles.burstRing(this.bird.x, this.bird.y, 0xffffff);
      }
    }
    if (this.bird.grounded && this.bird.speed() > 10) {
      this.particles.emitDust(this.bird.x, this.terrain.heightAt(this.bird.x) + 0.3, this.bird.speed(), slope);
    }

    // Ridge skim: airborne, fast, and hugging the hill — flow-state bonus.
    this.skimCd = Math.max(0, this.skimCd - dt);
    const skimming =
      !this.bird.grounded &&
      !this.bird.inWater &&
      this.bird.altitude > 0.4 &&
      this.bird.altitude < 3.2 &&
      this.bird.speed() > 40;
    if (skimming) {
      this.skimTime += dt;
      if (this.skimTime > 1.1 && this.skimCd <= 0) {
        this.skimCd = 1.4;
        const pts = 6;
        this.bonus += pts;
        this.awardXp(XP_RULES.coin);
        this.audio.butter();
        this.hud.toast(`Ridge skim +${pts}`, "cloud");
        this.particles.emitDust(this.bird.x, this.terrain.heightAt(this.bird.x) + 0.4, this.bird.speed(), slope);
      }
    } else if (this.bird.altitude > 6 || this.bird.grounded) {
      this.skimTime = 0;
    }
    if (this.feverOn || this.boostTimer > 0 || this.bird.speed() > 48 || ((skin.magnetAlways || skin.id === "aurora") && this.bird.speed() > 24)) {
      this.emitTrail(dt);
    }

    // Ambient particles for whatever power-up is currently in effect.
    this.powerFxAcc -= dt;
    if (this.powerFxAcc <= 0) {
      this.powerFxAcc = 0.05;
      this.emitPowerFx();
    }

    this.atmosphereFxAcc -= dt;
    if (this.atmosphereFxAcc <= 0) {
      const biomeFx = this.terrain.biomeAt(this.bird.x);
      this.particles.emitBiomeAtmosphere(this.bird.x, this.bird.y, biomeFx.id);
      this.atmosphereFxAcc = this.bird.altitude > 20 ? 0.08 : 0.19;
    }

    this.splashCd -= dt;
    if (this.bird.inWater && this.splashCd <= 0) {
      this.splashCd = 0.55;
      this.particles.emitSplash(this.bird.x, WATER_Y);
      this.audio.splash();
      this.shake(0.45);
      this.daylight = Math.max(0, this.daylight - DAYLIGHT_OCEAN_PENALTY);
      this.splashQuipN += 1;
      if (this.splashQuipN % 3 === 1) this.hud.toast(quip(SPLASH_QUIPS, this.splashQuipN), "cloud");
    }

    // Rare delight: golden geese, sneezes, encores. Never punishing.
    const surprise = this.surprises.tick(dt, this.bird.x - this.startX, !this.bird.grounded && !this.bird.inWater && !this.bird.asleep);
    if (surprise) {
      this.hud.toast(surprise.toast, "gold");
      switch (surprise.kind) {
        case "golden-goose":
          this.audio.honk();
          this.particles.emitConfetti(this.bird.x + 6, this.bird.y + 4);
          break;
        case "tailwind":
          this.audio.slideWhistle();
          this.bird.vx += 9;
          this.particles.emitWind(this.bird.x, this.bird.y, 1);
          break;
        case "sneeze":
          this.audio.sneeze();
          this.shake(0.3);
          this.particles.emitDust(this.bird.x, this.bird.y, this.bird.speed(), 0);
          break;
        case "coin-comet":
          this.audio.fanfare();
          this.particles.emitConfetti(this.bird.x + 10, this.bird.y + 8);
          break;
        case "photobomb":
          this.audio.boing();
          this.particles.emitSplash(this.bird.x + 4, WATER_Y);
          break;
        case "encore":
          this.audio.fanfare();
          this.enterFever();
          this.feverTimer = Math.max(this.feverTimer, surprise.feverSeconds);
          break;
      }
      if (surprise.coins > 0) {
        this.runCoins += surprise.coins;
        this.save.addCoins(surprise.coins);
      }
      this.telemetry.track("surprise", { kind: surprise.kind });
    }

    const idx = this.terrain.islandIndex(this.bird.x);
    if (idx > this.lastIsland) {
      this.lastIsland = idx;
      this.island = idx;
      const airborne = this.bird.y > WATER_Y + 2 && !this.bird.inWater;
      const b = biomeForIsland(idx);
      if (airborne) {
        this.daylight = Math.min(this.daylightMax(), this.daylight + DAYLIGHT_ISLAND_REFILL);
        this.particles.emitConfetti(this.bird.x, this.bird.y + 4);
        this.audio.island();
        this.audio.duckMusic(0.5, 0.6);
        this.hud.toast(`${b.emoji} ${b.name}`, "island");
        this.flash("island");
        this.glow(0.75);
        this.shake(0.7);
        this.haptic([40, 20, 60]);
        this.bonus += 80 * idx;
        this.awardXp(XP_RULES.island);
      } else {
        this.hud.toast(`Washed ashore on ${b.name}`, "warn");
      }
    }

    const magnetOn = this.feverOn || this.magnetTimer > 0 || skin.magnetAlways || this.powers.magnetOn();
    this.collect.update(dt, this.bird, this.terrain, magnetOn, this.elapsed, {
      onCoin: (x, y, gem) => {
        const base = gem ? 5 : 1;
        const value = Math.round(
          base *
            (this.save.state.gold ? 2 : 1) *
            this.powers.coinMult() *
            (this.mode.id === "coinrush" ? 2 : 1) *
            this.challengeMods.coinMult *
            this.masteryPerk.coinMult *
            (this.eventRun ? weeklyEvent().mods.coinMult : 1) *
            (this.goldenHour ? 2 : 1) *
            (this.stormfront && this.stormPhase >= 3 ? 2 : 1),
        );
        this.runCoins += value;
        this.bonus += 4 * COIN_VALUE * value;
        this.awardXp(XP_RULES.coin);
        this.audio.ding(gem);
        this.particles.emitCollect(x, y);
        if (gem) {
          this.runGems += 1;
          this.particles.burstRing(x, y, 0x9ae8ff);
          this.particles.emitSonicBoom(x, y);
          this.glow(0.8);
          this.hud.toast(`Sky gem +${value}`, "gold");
          if (this.runGems % 2 === 1) this.hud.toast(quip(GEM_QUIPS, this.runGems), "gold");
        }
        this.haptic(8);
      },
      onCloud: (kind, x, y) => this.onCloud(kind, x, y),
      onPickup: (kind, x, y) => this.onPickup(kind, x, y),
      onRing: (x, y) => this.onRing(x, y),
      onBalloon: (x, y) => this.onBalloon(x, y),
    });

    // Ring chain cools off if the player eases off the sky line.
    if (this.ringChainTimer > 0) {
      this.ringChainTimer -= dt;
      if (this.ringChainTimer <= 0) this.ringChain = 0;
    }

    if (this.feverOn) {
      this.feverTimer -= dt;
      if (this.feverTimer <= 0) {
        this.feverOn = false;
        this.perfectChain = 0;
        this.audio.setMusicMode("play");
      }
    }

    this.scoreAccum += Math.max(0, this.bird.vx) * dt * (this.feverOn ? 2 : 1);
    if (this.bird.altitude > this.maxAltitude) {
      this.maxAltitude = this.bird.altitude;
      if (this.maxAltitude > this.save.state.bestAltitude && this.save.state.bestAltitude > 40) {
        this.save.noteRecords(this.maxAltitude, this.launch.best);
        if (this.recordBanner !== "altitude") {
          this.recordBanner = "altitude";
          this.hud.toast("NEW ALTITUDE RECORD", "gold");
          this.flash("perfect");
        }
      }
    }
    if (this.bird.speed() > this.maxSpeed) this.maxSpeed = this.bird.speed();

    // Distance milestones: a small rising chime every 500 m keeps long runs
    // punctuated even when nothing else is happening.
    const runDist = this.bird.x - this.startX;
    if (runDist >= this.nextMilestone) {
      this.nextMilestone += 500;
      this.audio.milestone();
      this.particles.emitSparkle(this.bird.x, this.bird.y);
      // Every 1,000 m the sky heckles you — a wink to keep long runs fresh.
      if (this.nextMilestone % 1000 === 0) {
        this.hud.toast(quip(MILESTONE_QUIPS, this.nextMilestone), "cloud");
        this.glow(0.25);
      }
    }
    // Personal-best crossing: the single most addictive moment in the loop.
    // Fire it once, mid-run, the instant you pass your old distance record —
    // "beat your high score" is a feeling, not a post-run footnote.
    if (!this.distanceRecordCrossed && this.bestAtStart > 0 && runDist > this.bestAtStart) {
      this.distanceRecordCrossed = true;
      this.audio.fanfare();
      this.hud.toast("👑 NEW DISTANCE RECORD — keep flying!", "gold");
      this.flash("perfect");
      this.particles.emitConfetti(this.bird.x, this.bird.y + 4);
      this.glow(0.9);
      this.haptic([40, 30, 60]);
      this.telemetry.track("record_crossed", { at: Math.round(runDist) });
    }
    // STORMFRONT ESCALATION — the flagship hook: the storm is a character
    // with three acts. Same seed, same acts, for every pilot in the field.
    if (this.stormfront) {
      if (this.stormPhase === 1 && runDist >= 1000) {
        this.stormPhase = 2;
        this.weather.windMult *= 1.25;
        this.audio.storm();
        this.shake(0.5);
        this.hud.toast("⛈ PHASE II — the storm tightens. Wind +25%", "warn");
      } else if (this.stormPhase === 2 && runDist >= 2200) {
        this.stormPhase = 3;
        this.weather.windMult *= 1.25;
        this.audio.storm();
        this.shake(0.8);
        this.camera.punch(2);
        this.hud.toast("🌀 EYE WALL — survive to the line. Coins ×2 from here", "warn");
      }
    }
    // The moment you pass a rival's posted mark, gloat immediately — don't
    // make the player wait for the results screen to feel it.
    if (this.rival && !this.rivalBeatenToast && this.seed === this.rival.seed && runDist >= this.rival.distance) {
      this.rivalBeatenToast = true;
      this.audio.rivalDown();
      this.hud.toast(`🥊 Passed ${this.rival.name}'s mark — keep flying!`, "gold");
    }

    // Finish line (Race / Mass Race) — reached by distance, not by clock.
    if (this.mode.finish > 0 && !this.runRecorded && this.bird.x - this.startX >= this.mode.finish) {
      if (this.massRace.active) {
        // Placing is decided by who has actually crossed, not by a script.
        const s = this.massRace.standings(this.bird.x, this.startX, this.pilotName, 8);
        this.racePlace = s.place;
        this.raceField = s.total;
        this.raceFinishTime = this.runTime;
        const better = this.save.noteRacePlace(s.place, s.total);
        this.net?.sendFinish(this.runTime, this.bird.x - this.startX);

        // Photo finish: name the pilot within a wing-length of you at the line.
        const you = s.rows.find((r) => r.you);
        const rival = s.rows
          .filter((r) => !r.you)
          .sort((a, b) => Math.abs(a.distance - (you?.distance ?? 0)) - Math.abs(b.distance - (you?.distance ?? 0)))[0];
        if (rival && you && Math.abs(rival.distance - you.distance) < 25) {
          const won = you.distance > rival.distance;
          this.photoFinish = won ? `Photo finish — you edged ${rival.name}` : `Photo finish — ${rival.name} pipped you`;
          if (!won) this.nemesis = rival.name;
          this.hud.toast(this.photoFinish, won ? "gold" : "warn");
          this.flash("perfect");
        } else if (s.place > 1) {
          const ahead = s.rows.find((r) => r.place === s.place - 1);
          if (ahead) this.nemesis = ahead.name;
        }

        this.hud.toast(`FINISH · P${s.place} of ${s.total}`, s.place <= 3 ? "gold" : "island");
        if (better) this.hud.toast("New best placing!", "gold");
        if (this.duelActive) {
          const won = s.place === 1;
          const res = this.save.recordDuelResult(won, this.today);
          this.duelResult = won ? "won" : "lost";
          this.duelDelta = res.delta;
          this.lastRatingDelta = res.delta;
          this.lastRatingBonus = 0;
          this.hud.toast(
            won ? `⚔ Duel won! +${res.delta} rating` : `⚔ Duel lost · ${res.delta} rating`,
            won ? "gold" : "warn",
          );
          if (won && res.streak > 0 && res.streak % 5 === 0) this.hud.toast(`🔥 ${res.streak} duel wins in a row!`, "gold");
          // Duel prize skin: 10 lifetime duel wins earns the Hummingbird.
          if (this.save.state.duel.wins >= 10 && !this.save.state.ownedSkins.includes("hummingbird")) {
            this.save.ownSkin("hummingbird");
            this.hud.toast("🐦 Jewel Hummingbird unlocked — 10 duel wins!", "gold");
          }
          if (won && this.save.ownTrail("trail_duelist")) this.hud.toast("✨ Duelist trail unlocked!", "gold");
          this.audio.purchase();
        } else if (this.rankedRace) {
          const res = this.save.recordRivalResult(s.place, s.total, "massrace", this.today);
          this.lastRatingDelta = res.delta;
          this.lastRatingBonus = res.bonus;
          this.hud.toast(
            `Rival rating ${res.delta >= 0 ? "+" : ""}${res.delta} → ${this.save.state.rival.rating}${res.bonus > 0 ? ` · +${res.bonus}● streak` : ""}`,
            res.delta >= 0 ? "gold" : "warn",
          );
          this.audio.purchase();
          this.checkDivisionPrize();
        } else {
          this.lastRatingDelta = 0;
          this.lastRatingBonus = 0;
        }
      } else {
        this.hud.toast("FINISH!", "gold");
      }
      this.particles.emitConfetti(this.bird.x, this.bird.y + 4);
      this.audio.island();
      this.finishRun();
      return;
    }

    if (this.mode.clock > 0) {
      this.daylight -= dt;
      // GOLDEN HOUR — the last 22% of the day. The world turns amber, the
      // music opens, and every coin is worth double. Deep runs get a reason.
      const goldenNow = this.daylight > 0 && this.daylight < this.daylightMax() * 0.22;
      if (goldenNow && !this.goldenHour) {
        this.goldenHour = true;
        this.audio.goldenHour();
        this.hud.toast("🌇 GOLDEN HOUR — coins are worth double", "gold");
        this.flash("fever");
        this.glow(0.8);
      } else if (!goldenNow && this.goldenHour) {
        this.goldenHour = false; // sun flask refilled the day
      }
      // Golden Hour magic: the air itself glitters — drifting amber motes.
      if (this.goldenHour && Math.random() < dt * 6) {
        this.particles.emitSparkle(this.bird.x + 6 + Math.random() * 18, this.bird.y + (Math.random() - 0.5) * 10, 1, 0.72, 0.25);
      }
      if (this.daylight <= 0 && !this.bird.asleep) {
        this.onDaylightOut();
        return;
      }
    }

    // Session goals update live so the player sees a bar fill mid-flight.
    const done = this.goals.update({
      distance: this.bird.x - this.startX,
      perfects: this.perfects,
      combo: this.launch.best,
      altitude: this.maxAltitude,
      coins: this.runCoins,
      clouds: this.runClouds,
      gems: this.runGems,
      sunflowers: this.runSunflowers,
    });
    for (const g of done) {
      this.save.addCoins(g.reward);
      this.audio.ding();
      this.goalPop = `${g.label} ✓  +${g.reward}`;
      this.goalPopT = 2.6;
      this.hud.toast(`Goal complete +${g.reward}`, "quest");
      this.particles.emitConfetti(this.bird.x, this.bird.y + 3);
      this.bump();
    }

    this.hintTimer += dt;
    this.hint = this.computeHint();
  }

  /**
   * Take-off: rate it, pay it out, and sell it. This is the moment the whole
   * game is built around, so it gets slow-mo, a banner, particles and a chirp.
   */
  private onLaunch(): void {
    const res = this.launch.evaluate(this.bird, this.terrain, this.runTime);
    this.lastLaunch = res;
    if (res.rating === "none") {
      if (this.bird.launchSpeed > 18) this.audio.chirp();
      return;
    }

    const combo = this.launch.combo;
    this.launchBannerText = ratingLabel(res.rating, combo);
    this.launchBannerT = res.rating === "perfect" ? 1.25 : 0.9;
    this.audio.launchWhoosh(res.rating, res.speed);

    if (res.rating === "perfect") {
      this.perfects += 1;
      this.perfectChain += 1;
      this.bonus += 40 + combo * 15;
      this.awardXp(XP_RULES.perfect);
      this.audio.perfect();
      this.audio.duckMusic(0.32, 0.35);
      this.particles.burstRing(this.bird.x, this.bird.y, 0xffe08a);
      for (let i = 0; i < 10 + combo * 4; i++) this.particles.emitSparkle(this.bird.x, this.bird.y);
      this.flash("perfect");
      this.glow(0.85);
      this.shake(0.35 + Math.min(0.4, combo * 0.06));
      // Hit stop: 2-frame freeze for cinematic impact.
      if (!this.save.state.settings.reduceMotion) {
        this.hitStopTimer = 2 / 60;
      }
      this.haptic([50, 30, 50]);
      // A breath of slow-motion so the launch lands emotionally.
      if (!this.save.state.settings.reduceMotion) {
        this.timeScale = 0.45;
        this.zenithTimer = 0.16;
      }
      // Cinematic beat: dolly-zoom + banked tilt sized to the chain.
      this.camera.punch(5 + combo);
      this.camera.dollyZoom(1.5 + Math.min(2.4, combo * 0.5));
      this.camera.tilt(-0.06 - Math.min(0.14, combo * 0.03));
      if (res.speed > 74) {
        this.particles.emitSonicBoom(this.bird.x, this.bird.y);
        this.hud.toast(quip(BIG_LAUNCH_QUIPS, combo + Math.round(res.speed)), "zenith");
      }
      if (this.perfectChain >= FEVER_NEED) this.enterFever();
    } else if (res.rating === "great") {
      this.bonus += 18;
      this.awardXp(3);
      this.audio.butter();
      this.particles.burstRing(this.bird.x, this.bird.y, 0xc8f0ff);
      this.camera.punch(3);
      this.haptic(9);
    } else {
      this.bonus += 6;
      this.audio.chirp();
    }
  }

  /** Sunflower pad: a springy launch off a bloom — pure, reviewable bounce. */
  private onSunflower(): void {
    this.runSunflowers += 1;
    this.bonus += 80;
    this.awardXp(XP_RULES.coin);
    this.audio.boing();
    this.particles.burstRing(this.bird.x, this.bird.y, 0xffcf33);
    this.particles.emitConfetti(this.bird.x, this.bird.y + 1);
    this.camera.punch(4);
    this.hud.toast("🌻 Sunflower bounce +80", "gold");
    this.glow(0.55);
    this.haptic([20, 10, 40]);
    this.telemetry.track("sunflower", {});
  }

  /** Landings feed straight back into momentum, so they get feedback too. */
  private onLanding(): void {
    const q = this.bird.landingQuality;
    if (q >= LAND_PERFECT && this.bird.speed() > 30) {
      this.bonus += 12;
      this.audio.butter();
      this.hud.toast("Butter landing", "cloud");
      this.particles.burstRing(this.bird.x, this.bird.y, 0xffffff);
    } else if (q < 0.8) {
      this.launch.breakCombo();
      this.perfectChain = 0;
      if (this.bird.impact > 6) {
        this.audio.land(this.bird.impact);
        this.shake(Math.min(0.5, this.bird.impact * 0.035));
        this.particles.emitDust(this.bird.x, this.bird.y, this.bird.speed(), 0);
      }
    }
  }

  private enterFever(): void {
    const was = this.feverOn;
    this.feverOn = true;
    this.feverReached = true;
    this.feverTimer = FEVER_DURATION + this.skin.feverBonus + this.masteryPerk.feverBonus;
    if (!was) {
      this.audio.feverOn();
      this.audio.setMusicMode("fever");
      this.hud.toast("FEVER", "fever");
      this.flash("fever");
      this.glow(0.95);
      this.particles.emitConfetti(this.bird.x, this.bird.y);
      this.hud.toast(quip(FEVER_QUIPS, this.perfectChain), "fever");
      this.telemetry.track("fever", { distance: Math.round(this.bird.x - this.startX) });
    }
  }

  /** Cloud gameplay — each kind pays back into the momentum loop. */
  private onCloud(kind: CloudKind, x: number, y: number): void {
    this.runClouds += 1;
    this.awardXp(XP_RULES.cloud);
    this.audio.cloud();
    this.particles.emitCollect(x, y);
    this.particles.burstRing(x, y, 0xffffff);
    const cb = this.powers.cloudBoostOn();
    switch (kind) {
      case "boost":
        this.powers.add("longglide");
        this.bonus += 25;
        this.hud.toast("Cloud boost — light as air", "power");
        break;
      case "golden":
        this.runCoins += 10;
        this.bonus += 60;
        this.hud.toast("Golden cloud +10", "gold");
        break;
      case "wind":
        this.bird.vx += cb ? 22 : 14;
        this.bonus += 25;
        this.hud.toast("Tailwind cloud", "power");
        break;
      case "super":
        this.powers.add("wingboost");
        this.powers.add("longglide");
        this.bonus += 90;
        this.hud.toast("SUPER CLOUD", "fever");
        this.flash("fever");
        break;
      default:
        this.bonus += CLOUD_BONUS;
        this.bird.vx += cb ? 8 : 2;
        break;
    }
    if (cb) this.bird.vx += 6;
  }

  /** Threading a sky ring: a speed surge + score that scales with the chain. */
  private onRing(x: number, y: number): void {
    this.runRings += 1;
    this.ringChainTimer = 2.8;
    this.ringChain += 1;
    const chainBonus = Math.min(4, this.ringChain) * 8;
    const pts = 30 + chainBonus;
    this.bonus += pts;
    this.awardXp(XP_RULES.cloud);
    this.audio.boing();
    this.bird.vx += 8 + Math.min(14, this.ringChain * 2);
    this.particles.burstRing(x, y, 0xffd76a);
    this.particles.emitSonicBoom(x, y);
    if (this.ringChain >= 3) {
      this.particles.emitConfetti(x, y + 2);
      this.hud.toast(`RING CHAIN ×${this.ringChain} +${pts}`, "gold");
      this.flash("fever");
      this.glow(0.6);
      this.audio.fanfare();
    } else {
      this.hud.toast(`Through the ring +${pts}`, "gold");
    }
    this.haptic([20, 10, 30]);
    this.telemetry.track("ring", { chain: this.ringChain });
  }

  /** Balloon pop: a springy launch back into the sky — pure, silly reward. */
  private onBalloon(x: number, y: number): void {
    this.runBalloons += 1;
    this.bird.vy = Math.max(this.bird.vy, 46);
    this.bird.vx += 18;
    this.bird.grounded = false;
    this.bird.inWater = false;
    this.bonus += 150;
    this.awardXp(XP_RULES.zenith);
    this.audio.balloon();
    this.particles.emitConfetti(x, y + 1);
    this.particles.burstRing(x, y, 0xff6b6b);
    this.camera.punch(6);
    this.shake(0.3);
    this.hud.toast("🎈 Balloon bounce! +150", "gold");
    this.flash("fever");
    this.glow(0.7);
    this.haptic([20, 10, 40, 20, 60]);
    this.telemetry.track("balloon", {});
  }

  private checkZenith(): void {
    const vy = this.bird.vy;
    if (!this.bird.grounded && !this.bird.asleep && this.prevVy > 0 && vy <= 0) {
      const ground = Math.max(this.terrain.heightAt(this.bird.x), WATER_Y);
      const alt = this.bird.y - ground;
      if (alt >= ZENITH_ALT) {
        this.zeniths += 1;
        const pts = Math.round(alt * 4);
        this.bonus += pts;
        this.timeScale = ZENITH_SLOWMO;
        this.zenithTimer = ZENITH_DURATION;
        this.camera.punch(9);
        this.particles.burstRing(this.bird.x, this.bird.y, 0xffffff);
        for (let i = 0; i < 14; i++) this.particles.emitSparkle(this.bird.x, this.bird.y);
        this.audio.zenith();
        this.audio.duckMusic(0.6, 0.7);
        this.hud.toast(`ZENITH +${pts}`, "zenith");
        this.flash("perfect");
        this.glow(0.8);
        this.haptic([60, 40, 80]);
        this.telemetry.track("zenith", { alt: Math.round(alt) });
      }
    }
    this.prevVy = vy;
  }

  private onPickup(kind: PickupKind, x: number, y: number): void {
    if (this.challengeMods.noPowerups) {
      // Pure Sky: the pickup pops visually but grants nothing.
      this.particles.emitCollect(x, y);
      this.hud.toast("Pure Sky — power-ups are inert", "info");
      return;
    }
    this.pickups += 1;
    this.bonus += 25;
    this.audio.powerup();
    this.particles.emitCollect(x, y);
    this.haptic([40, 30, 40, 30, 100]);
    this.powers.add(kind);
    switch (kind) {
      case "sun":
        this.daylight = Math.min(this.daylightMax(), this.daylight + PICKUP_SUN_TIME);
        this.particles.burstRing(x, y, 0xffd24a);
        this.hud.toast(`+${PICKUP_SUN_TIME}s Daylight ☀`, "power");
        break;
      case "rocket":
        this.boostTimer = BOOST_TIME;
        this.bird.vx += 36;
        this.bird.vy += 7;
        this.particles.burstRing(x, y, 0xff5a3a);
        this.audio.boost();
        this.hud.toast("Rocket Speed 🚀", "power");
        this.shake(0.55);
        break;
      case "magnet":
        this.magnetTimer = MAGNET_TIME;
        this.particles.burstRing(x, y, 0x8a6cff);
        this.audio.magnetOn();
        this.hud.toast(`Coin Magnet ${MAGNET_TIME}s 🧲`, "power");
        break;
      case "shield":
        this.shield = Math.min(2, this.shield + 1);
        this.powers.shield = this.shield;
        this.particles.burstRing(x, y, 0x5ad8ff);
        this.hud.toast("Sea Shield Active 🛡", "power");
        break;
      case "longglide":
        this.particles.burstRing(x, y, 0x7fe8c8);
        this.hud.toast("Long Glide 🪁 Low Drag", "power");
        break;
      case "wingboost":
        this.particles.burstRing(x, y, 0xffa8e0);
        this.hud.toast("Wing Boost 🕊 Super Lift", "power");
        break;
      case "feather":
        this.particles.burstRing(x, y, 0xfff0c0);
        this.hud.toast("Feather 🐦 Butter Landings", "power");
        break;
      case "goldenwings":
        this.particles.burstRing(x, y, 0xffd76a);
        this.particles.emitConfetti(x, y + 2);
        this.flash("perfect");
        this.glow(1.0);
        this.audio.island();
        this.camera.punch(7);
        this.hud.toast("✨ GOLDEN WINGS ✨", "gold");
        break;
      case "cloudboost":
        this.particles.burstRing(x, y, 0xc8e8ff);
        this.hud.toast("Cloud Boost ☁ Wind Lift", "power");
        break;
      default:
        break;
    }
  }

  /** First-flight coach line takes priority over ambient hints. */
  private coachHint(): string {
    if (!this.coach) return "";
    const v = this.coach.view();
    if (v.step < 0 || !v.text) return "";
    const pips = Array.from({ length: v.steps }, (_, i) => (i < v.step ? "●" : i === v.step ? "◉" : "○")).join(" ");
    return `${pips}  ${v.text}`;
  }

  private computeHint(): string {
    const novice = this.save.state.tutorialRuns < 3;
    if (this.hintTimer > (novice ? 26 : 8)) {
      if (this.terrain.isOcean(this.bird.x + 40) && !this.terrain.isOcean(this.bird.x) && this.island < 2) return "Build speed — then RELEASE";
      return "";
    }
    const slope = this.terrain.slopeAt(this.bird.x);
    if (this.hintTimer < 2.6 && slope < -0.08) return "HOLD to dive";
    if (slope > 0.16 && this.bird.grounded && this.bird.speed() > 18) return "RELEASE to launch";
    if (this.weather.inThermal && !this.input.diving) return "Riding the thermal!";
    if (this.terrain.isOcean(this.bird.x + 40) && !this.terrain.isOcean(this.bird.x)) return "Build speed — then RELEASE";
    return "";
  }

  /** Current trail colour, from the equipped prize trail or the bird's skin. */
  private trailColor(): [number, number, number] {
    const prize = this.save.state.activeTrail ? TRAILS[this.save.state.activeTrail] : undefined;
    if (prize && prize.colors.length) {
      return prize.colors[Math.floor(this.hueT) % prize.colors.length]!;
    }
    switch (this.skin.id) {
      case "aurora":
        return hsl(this.hueT % 1, 0.9, 0.65);
      case "phoenix":
        return [1, 0.5, 0.16];
      case "bluejay":
        return [0.6, 0.85, 1];
      case "owl":
        return [0.75, 0.65, 1];
      case "ember":
        return [1, 0.55, 0.2];
      default:
        return [1, 0.95, 0.85];
    }
  }

  /** Advance the trail hue so prize/aurora colours cycle smoothly (not strobe). */
  private advanceTrailHue(dt: number): void {
    const prize = this.save.state.activeTrail ? TRAILS[this.save.state.activeTrail] : undefined;
    if (prize && prize.colors.length) this.hueT += dt * 2.4;
    else if (this.skin.id === "aurora") this.hueT += dt * 0.45;
  }

  /** Streams the glowing ribbon behind the bird, matching the sparkle trail. */
  private updateTrailRibbon(dt: number): void {
    this.advanceTrailHue(dt);
    const c = this.trailColor();
    this.trail.setColor(c[0], c[1], c[2]);
    const show =
      this.state === "playing" &&
      (this.feverOn || this.boostTimer > 0 || this.bird.speed() > 48 || ((this.skin.magnetAlways || this.skin.id === "aurora") && this.bird.speed() > 24));
    if (show) this.trail.push(this.bird.x, this.bird.y);
    this.trail.update(dt, show ? 1 : 0);
  }

  private emitTrail(dt: number): void {
    this.trailFxAcc -= dt;
    if (this.trailFxAcc > 0) return;
    this.trailFxAcc = this.bird.speed() > 82 ? 0.028 : 0.055;
    const c = this.trailColor();
    this.particles.emitSparkle(this.bird.x - 0.4, this.bird.y, c[0], c[1], c[2]);
    if (this.bird.speed() > 68) this.particles.emitWingTrails(this.bird.x, this.bird.y, this.bird.speed());
  }

  /** Ambient particles for the power-up currently in effect. */
  private emitPowerFx(): void {
    const x = this.bird.x;
    const y = this.bird.y;
    if (this.powers.has("goldenwings")) {
      this.particles.emitSparkle(x - Math.random() * 1.4, y + (Math.random() - 0.5) * 1.6, 1, 0.8 + Math.random() * 0.2, 0.3);
    } else if (this.powers.has("magnet") || this.magnetTimer > 0) {
      this.particles.emitSparkle(x + 1.5 + Math.random() * 2.5, y + (Math.random() - 0.5) * 2.2, 0.55, 0.42, 1);
    }
    if (this.shield > 0) {
      this.particles.emitSparkle(x + (Math.random() - 0.5) * 1.8, y + (Math.random() - 0.5) * 1.8, 0.35, 0.85, 1);
    }
    if (this.powers.has("wingboost")) this.particles.emitWind(x, y, 0.6);
    if (this.powers.has("longglide")) this.particles.emitWind(x, y, 0.35);
    if (this.powers.has("cloudboost")) this.particles.emitWind(x, y, 0.2);
    if (this.powers.has("feather")) this.particles.emitSparkle(x - 0.5, y + 0.3, 1, 0.98, 0.85);
    if (this.boostTimer > 0) this.particles.emitSparkle(x - 0.6, y - 0.2, 1, 0.45, 0.15);
  }

  private render(visDt: number, rawDt: number): void {
    const playing = this.state === "playing";
    const diving = playing && this.input.diving;

    if (this.versus && this.p1 && this.p2) {
      this.renderVersus(visDt, rawDt);
      return;
    }

    const glow = this.feverOn || this.powers.has("goldenwings") || (this.skin.magnetAlways && this.bird.speed() > 30);
    this.bird.syncVisual(visDt, diving, glow, this.elapsed, this.terrain);
    this.massRace.syncVisual(visDt, this.bird.x);
    this.finishRemaining = this.finishGate.update(visDt, this.bird.x);
    this.updateTrailRibbon(visDt);
    this.particles.update(visDt);
    this.camera.update(rawDt, this.bird, playing, this.terrain.heightAt(this.bird.x));
    this.livingBg.update(rawDt, this.bird.x, this.bird.y);

    this.applyWorldLook(this.bird.x, this.bird.altitude);
    this.terrain.update(this.bird.x);

    const dayT = Math.max(0, Math.min(1, this.daylight / this.daylightMax()));
    this.audio.update(rawDt, this.bird.speed(), diving, this.bird.grounded, this.feverOn, dayT, playing, this.weather.gust);
    this.audio.setMusicIntensity(this.musicIntensity());

    const size = this.renderer.getSize(this.tmpSize);
    this.renderer.setViewport(0, 0, size.x, size.y);
    this.renderer.setScissorTest(false);
    if (this.useBloom) {
      this.updateGlowBase();
      this.fx.render(rawDt);
    } else {
      this.renderer.render(this.scene, this.camera.camera);
    }
  }

  /** Shared sky / fog / palette work, driven by whoever the camera follows. */
  private applyWorldLook(x: number, altitude: number): void {
    const biome = this.terrain.biomeAt(x + 60);
    this.audio.setBiome(biome.musicMode);
    const dayT = Math.max(0, Math.min(1, this.daylight / this.daylightMax()));
    const altT = clamp((altitude - ALT_CLOUDS) / (ALT_STRATO - ALT_CLOUDS), 0, 1);
    const isAurora = biome.id === "aurora";
    const auroraVal = isAurora ? 0.9 : altT > 0.4 ? (altT - 0.4) * 1.3 : 0;
    this.sky.setBiomeTint(biome.skyTop, biome.skyHorizon, biome.skyMix);
    this.sky.setBiomeAtmosphere(biome.cloudTint, biome.cloudDensity, biome.glow);
    this.sky.setFlightAltitude(altitude);
    this.sky.setAltitude(altT);
    this.sky.setAurora(auroraVal);
    const pal = this.sky.update(dayT, x, this.elapsed);
    this.terrain.setPalette(pal, x);
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(this.sky.fogColor).lerp(this.tmpColor.setHex(biome.fogTint), 0.25);
      // Thin the haze as we climb so the whole world opens up beneath the bird.
      this.scene.fog.near = 62 + altT * 300;
      this.scene.fog.far = 380 + altT * 900;
      this.renderer.setClearColor(this.scene.fog.color, 1);
    }
    this.altZone =
      altitude >= ALT_STRATO ? 4 : altitude >= ALT_HIGH ? 3 : altitude >= ALT_CLOUDS ? 2 : altitude >= ALT_SKY ? 1 : 0;
  }

  /** Two viewports, one scene, one shared terrain — nothing is simulated twice. */
  private renderVersus(visDt: number, rawDt: number): void {
    const p1 = this.p1!;
    const p2 = this.p2!;
    const playing = this.state === "playing";
    p1.syncVisual(visDt, playing && this.input.diving, this.elapsed, this.terrain);
    p2.syncVisual(visDt, playing && this.input.diving2, this.elapsed, this.terrain);
    this.particles.update(visDt);
    p1.updateCamera(rawDt, playing, this.terrain);
    p2.updateCamera(rawDt, playing, this.terrain);

    const lead = p1.bird.x >= p2.bird.x ? p1 : p2;
    this.applyWorldLook(lead.bird.x, lead.bird.altitude);
    this.terrain.update(lead.bird.x);
    this.audio.update(rawDt, lead.bird.speed(), playing && this.input.diving, lead.bird.grounded, false, 1, playing, 0);
    this.audio.setMusicIntensity(playing ? Math.min(1, lead.bird.speed() / 90 * 0.5 + Math.min(1, lead.bird.altitude / ALT_HIGH) * 0.3) : 0);

    const size = this.renderer.getSize(this.tmpSize);
    const vertical = size.x / Math.max(1, size.y) >= 1.25;
    const w = vertical ? Math.floor(size.x / 2) : size.x;
    const h = vertical ? size.y : Math.floor(size.y / 2);
    this.renderer.setScissorTest(true);
    const views: [Racer, number, number][] = vertical
      ? [
          [p1, 0, 0],
          [p2, w, 0],
        ]
      : [
          [p1, 0, h],
          [p2, 0, 0],
        ];
    for (const [racer, ox, oy] of views) {
      this.renderer.setViewport(ox, oy, w, h);
      this.renderer.setScissor(ox, oy, w, h);
      racer.camera.resize(w / Math.max(1, h));
      this.renderer.render(this.scene, racer.camera.camera);
    }
    this.renderer.setScissorTest(false);
  }


  /* ------------------------------------------------------------- run flow */

  private startRun(opts?: { duel?: boolean; challenge?: "" | "daily" | `gauntlet${number}`; event?: boolean; storm?: boolean }): void {
    this.exitVersus();
    this.mode = modeById(this.modeId);
    // Snapshot the record to beat BEFORE this run writes anything, so the
    // mid-run "new record" moment and the results "NEW BEST" banner compare
    // against the genuinely previous best.
    this.bestAtStart = this.save.state.bestDistance;
    this.distanceRecordCrossed = false;
    this.newBest = false;
    // World variety: in the default "today" mode a plain casual flight gets
    // fresh random hills every run so no two free-flights look alike. An
    // explicit Yesterday/Random seed pick is honoured, and date-seeded
    // daily/gauntlet runs plus shared-field races (duels, events, stormfront,
    // mass races) keep their fixed seed so the field stays fair/comparable.
    const casualRun =
      this.seedMode === "today" && !opts?.duel && !opts?.challenge && !opts?.event && !opts?.storm && this.modeId !== "massrace";
    if (casualRun) {
      this.rebuildWorld(`fly-${Math.random().toString(36).slice(2, 10)}`);
    } else if (opts?.challenge && this.seed !== this.today) {
      this.rebuildWorld(this.today);
    }
    // Duels and challenges only apply when their action explicitly asks for
    // them; every other launch path resets to a plain run.
    this.duelActive = Boolean(opts?.duel);
    this.duelResult = "";
    this.duelDelta = 0;
    this.challengeRun = opts?.challenge ?? "";
    this.challengeMods = this.challengeRun === "daily" ? modsFor(dailyChallenge(this.today).modifier.id) : NO_MODS;
    this.eventRun = Boolean(opts?.event);
    this.serverPlaceApplied = false;
    this.goldenHour = false;
    this.nextMilestone = 500;
    this.rivalBeatenToast = false;
    this.stormPhase = 1;
    // Stormfront survives only through launchMatch(); any other entry resets.
    if (!opts?.storm) this.stormfront = false;
    this.challengeOutcome = "";
    this.resetRun(false);
    // First ever flight: spin up the interactive dive/launch/soar coach.
    // Non-qualifying launches (duels, events, other modes) clear any live
    // coach so tutorial text can never bleed into them.
    if (!this.save.state.firstFlightDone && this.modeId === "daytrip" && !this.duelActive && !this.challengeRun && !this.eventRun) {
      this.coach = new FirstFlight(false);
    } else {
      this.coach = null;
    }
    // Modes reshape the clock; Race has no sunset at all.
    this.daylight =
      (this.mode.clock > 0 ? this.mode.clock : this.daylightMax()) *
      this.challengeMods.daylightMult *
      (this.eventRun ? weeklyEvent().mods.daylightMult : 1);
    this.weather.windMult = (this.eventRun ? weeklyEvent().mods.windMult : 1) * (this.stormfront ? 1.7 : 1);
    this.weather.stormfront = this.stormfront;
    if (this.stormfront) this.hud.toast("⛈ STORMFRONT — same storm for every pilot. Survive and outfly.", "warn");
    // Mass Race: build the 40-bird grid on the *same* seed so the field is
    // identical for anyone flying this race. Real players take over slots as
    // they join; unfilled slots keep flying as local squadron pilots.
    if (this.modeId === "massrace") {
      const fieldSize = this.duelActive ? 1 : this.roomSize;
      this.massRace.spawn(fieldSize, `${this.seed}:${this.modeId}:${fieldSize}`, this.terrain, this.startX);
      if (this.duelActive) {
        // Duel: one seeded opponent whose skill tracks your rating band.
        const opp = duelOpponent(`${this.seed}:${this.today}`, this.save.state.rival.rating);
        this.massRace.setFieldSkill(duelSkillFor(this.save.state.rival.rating));
        const r = this.massRace.rivals[0];
        if (r) r.name = opp.name;
        this.hud.toast(`⚔ Duel vs ${opp.name} · first to the line`, "gold");
      } else {
        this.massRace.setFieldSkill(this.roomSkill === "ace" ? 1.25 : this.roomSkill === "chill" ? 0.7 : 1);
      }
      // Time-shifted multiplayer: seat doppelgängers of real players from the
      // global board over local slots (name + skill from their best run).
      if (!this.duelActive) {
        const page = this.board.peek("global", "distance");
        const rows = (page?.entries ?? [])
          .filter((en) => !en.you && en.name)
          .slice(0, 8)
          .map((en) => ({ name: en.name, distance: en.distance }));
        if (rows.length) this.massRace.applyGhosts(rows, this.mode.finish);
      }
      this.raceField = fieldSize + 1;
      this.racePlace = 0;
      this.raceFinishTime = 0;
      this.photoFinish = "";
      this.lastRatingDelta = 0;
      this.lastRatingBonus = 0;
      this.lastPlace = 0;
      this.overtakeAcc = 0;
      // Duels are strictly 1v1 vs the seeded opponent — never let a stale
      // room connection promote remote pilots into the field.
      if (this.duelActive) this.disconnectRace();
      else this.connectRace();
    } else {
      this.disconnectRace();
      this.massRace.clear();
      this.raceField = 0;
    }
    // Give race modes something to actually aim at.
    if (this.mode.finish > 0) this.finishGate.place(this.startX + this.mode.finish, this.terrain);
    else this.finishGate.hide();

    const armed = this.save.consumeArmedBoosts();
    for (const id of armed) this.applyBoost(id);
    if (this.eventRun) {
      const ev = weeklyEvent();
      this.hud.toast(`${ev.icon} ${ev.name} · fly ${ev.target.toLocaleString()} m`, "quest");
      this.audio.eventStinger();
    }
    if (this.challengeRun === "daily") {
      const c = dailyChallenge(this.today);
      this.hud.toast(`${c.modifier.icon} ${c.title} · ${c.modifier.label}`, "quest");
    } else if (this.challengeRun.startsWith("gauntlet")) {
      const idx = Number(this.challengeRun.slice(8)) || 0;
      const st = weeklyGauntlet(weekKey()).stages[idx];
      if (st) this.hud.toast(`🌩 Gauntlet ${idx + 1}/3 · ${st.label}`, "quest");
    }
    this.setState("playing");
    this.setScreen("main");
    this.camera.setIntro(0);
    this.hint = "HOLD to dive";
    void this.audio.resume();
    this.audio.setMusicMode("play");
    this.telemetry.track("run_start", { mode: this.modeId, seed: this.seed, skin: this.skin.id, boosts: armed.join(",") || "none", gold: this.save.state.gold });
  }

  private applyBoost(id: string): void {
    const def = BOOSTS.find((b) => b.id === id);
    switch (id) {
      case "shield":
        this.shield = 1;
        break;
      case "magnet":
        this.magnetTimer = 15;
        break;
      case "sunflask":
        this.daylight += 12;
        break;
      case "stormward":
        this.weather.ward = true;
        break;
      case "hotwings":
        this.enterFever();
        break;
      case "headstart": {
        let hx = this.startX + HEADSTART_DISTANCE;
        for (let i = 0; i < 40; i++) {
          if (this.terrain.slopeAt(hx) < -0.12 && !this.terrain.isOcean(hx)) break;
          hx += 4;
        }
        this.bird.x = hx;
        this.bird.y = this.terrain.heightAt(hx) + BIRD_RADIUS + 3;
        this.bird.vx = 46;
        this.bird.vy = -4;
        this.lastIsland = this.terrain.islandIndex(hx);
        this.island = this.lastIsland;
        this.terrain.update(hx);
        this.camera.snapTo(this.bird);
        break;
      }
      default:
        return;
    }
    if (def) this.hud.toast(`${def.icon} ${def.name} armed`, "power");
  }

  private onDaylightOut(): void {
    this.bird.asleep = true;
    this.daylight = 0;
    // Death drama: the sun wins in slow motion. Reuses the zenith slow-mo
    // plumbing so time restores itself automatically.
    this.timeScale = 0.35;
    this.zenithTimer = 1.1;
    this.camera.punch(0.5);
    this.audio.sleep();
    this.audio.setMusicMode("sleep");
    this.flash("sleep");
    this.hud.toast(quip(SLEEP_QUIPS, Math.round(this.bird.x)), "cloud");
    const gold = this.save.state.gold;
    const canCoins = this.save.state.wallet >= CONTINUE_COST;
    const canAd = this.portalEnabled()
      ? Boolean(this.platform && this.platform.name !== "none")
      : !gold && this.ads.isAvailable() && this.save.adsLeftToday() > 0;
    // Honest tiering: free players get 1 second wind, VIP gets 2, and Gold
    // gets what its feature list promises — the sun never wins on a technicality.
    const maxContinues = gold ? 99 : this.save.isVipActive() ? 2 : 1;
    if (this.continuesUsed < maxContinues && (gold || canCoins || canAd)) {
      this.continueTimer = CONTINUE_TIMEOUT;
      this.setState("continue");
    } else {
      this.finishRun();
    }
  }

  private doContinue(source: string): void {
    this.continuesUsed += 1;
    this.bird.asleep = false;
    this.daylight = CONTINUE_DAYLIGHT;
    this.bird.y = Math.max(this.bird.y, this.terrain.heightAt(this.bird.x) + BIRD_RADIUS + 0.5);
    this.bird.vy = 16;
    this.bird.vx = Math.max(this.bird.vx, 24);
    this.bird.grounded = false;
    this.bird.inWater = false;
    this.particles.emitConfetti(this.bird.x, this.bird.y);
    this.audio.island();
    this.audio.setMusicMode(this.feverOn ? "fever" : "play");
    this.hud.toast("Second wind!", "island");
    this.setState("playing");
    this.telemetry.track("continue_used", { source });
  }

  private finishRun(): void {
    if (this.runRecorded) return;
    this.runRecorded = true;
    this.bird.asleep = true;
    const stats = this.runStats();
    this.newBest = this.bestAtStart > 0 && stats.distance > this.bestAtStart;
    this.telemetry.track("run_end", { mode: this.modeId, distance: Math.round(stats.distance), newBest: this.newBest });

    // A duel abandoned short of the line is a loss — no free retries on rating.
    if (this.duelActive && this.duelResult === "") {
      const res = this.save.recordDuelResult(false, this.today);
      this.duelResult = "lost";
      this.duelDelta = res.delta;
      this.lastRatingDelta = res.delta;
      this.hud.toast(`⚔ Duel lost — never reached the line · ${res.delta} rating`, "warn");
    }

    this.nearMiss = evaluateNearMiss(
      stats.distance,
      this.save.state.bestDistance,
      this.maxAltitude,
      this.save.state.bestAltitude,
      this.launch.best,
      this.save.state.bestCombo,
    );
    this.save.noteRecords(this.maxAltitude, this.launch.best);
    this.flow.noteRun(stats.distance, this.perfects, this.launch.goods + this.launch.greats + this.launch.perfects, this.save);
    this.terrain.setDifficulty(this.flow.difficulty());

    // One-off "fresh hills" runs have no stable seed to build a personal best
    // on, so skip ghost recording for them (the ghost only ever replays a
    // run on identical terrain).
    const beatGhost = this.seed.startsWith("fly-") ? false : this.ghostRecorder.commit(this.seed, stats.distance);
    if (beatGhost) {
      this.hud.toast("New personal ghost recorded", "gold");
      this.telemetry.track("ghost_new", { distance: Math.round(stats.distance) });
    }

    // Global board + weekly cups both score off the same verified run stats.
    this.board.submit({
      deviceId: this.save.state.deviceId,
      name: this.racedName(),
      skin: this.skin.id,
      distance: Math.round(stats.distance),
      altitude: Math.round(this.maxAltitude),
      perfects: this.perfects,
      coins: this.runCoins,
      score: Math.round(this.score()),
      seed: this.seed,
      mode: this.modeId,
    });
    this.boardPage = null;
    // Re-pull the board so the results screen (and the home screen) can show
    // the just-earned rank. Local rows were already updated synchronously, so
    // this resolves to the new standing without a network round-trip.
    void this.refreshBoard(true);
    const improvedCups = this.cups.submit(this.modeId, {
      distance: stats.distance,
      altitude: this.maxAltitude,
      perfects: this.perfects,
      coins: this.runCoins,
    });
    for (const cup of improvedCups) this.hud.toast(`${cup.icon} ${cup.name} — new personal best`, "gold");
    this.save.persist();

    this.newlyCompleted = this.missions.applyRun(stats);
    this.claimedQuests = this.missions.claimQuests(this.today, stats);

    // Daily challenge / weekly gauntlet resolution for flagged runs.
    this.challengeOutcome = "";
    // Rival verdict first: same seed, straight distance comparison. Runs on
    // ANY run flown on the rival's hills (the recipient shouldn't need to
    // find a special mode — the link already set the world).
    if (this.rival && this.seed === this.rival.seed && this.rivalResult === "") {
      const won = stats.distance >= this.rival.distance;
      this.rivalResult = won ? "won" : "lost";
      if (won) {
        const bounty = this.save.isVipActive() ? 300 : 150;
        this.save.addCoins(bounty);
        this.challengeOutcome = `🥊 Challenge won! Out-flew ${this.rival.name} (${this.rival.distance} m) · +${bounty} coins`;
        this.hud.toast(this.challengeOutcome, "gold");
        this.audio.island();
      } else {
        this.challengeOutcome = `🥊 ${this.rival.name} still leads — ${Math.round(stats.distance)} m of ${this.rival.distance} m`;
        this.hud.toast("Their mark stands. Fly again.", "warn");
      }
      this.telemetry.track("rival_settled", { won });
    }
    if (this.challengeRun === "daily") {
      const c = dailyChallenge(this.today);
      if (dailyDone(stats, c) && this.save.completeDaily(this.today)) {
        this.save.addCoins(c.reward);
        this.challengeOutcome = `☀ Daily challenge complete · +${c.reward} coins`;
        this.hud.toast(this.challengeOutcome, "gold");
        this.audio.island();
      } else if (!dailyDone(stats, c)) {
        this.challengeOutcome = `Daily challenge missed — needed ${c.target} ${c.metric}`;
      }
    } else if (this.challengeRun.startsWith("gauntlet")) {
      const idx = Number(this.challengeRun.slice(8)) || 0;
      const g = weeklyGauntlet(weekKey());
      const st = g.stages[idx];
      if (st && stageDone(stats, st)) {
        const res = this.save.completeGauntletStage(g.week, idx);
        if (res) {
          this.save.addCoins(st.reward);
          this.challengeOutcome = `🌩 Gauntlet stage ${idx + 1} clear · +${st.reward} coins`;
          this.hud.toast(this.challengeOutcome, "gold");
          if (res === "clear") {
            this.save.addCoins(g.clearBonus);
            this.hud.toast(`🏆 GAUNTLET CLEARED · +${g.clearBonus} coins`, "gold");
            if (this.save.ownTrail("trail_gauntlet")) this.hud.toast("✨ Stormline trail unlocked!", "gold");
            // Gauntlet prize skin: 5 lifetime clears earns the Stormcrow.
            if (this.save.state.challenges.gauntletsCleared >= 5 && !this.save.state.ownedSkins.includes("stormcrow")) {
              this.save.ownSkin("stormcrow");
              this.hud.toast("🐦 Stormcrow unlocked — 5 gauntlets cleared!", "gold");
            }
            this.audio.island();
          }
        }
      } else if (st) {
        this.challengeOutcome = `Gauntlet stage ${idx + 1} missed — needed ${st.target} ${st.metric}`;
      }
    }

    // Weekly live event: clear = hit the event distance in an event-flagged run.
    if (this.eventRun) {
      const ev = weeklyEvent();
      if (stats.distance >= ev.target) {
        const counts = this.save.recordEventClear(ev.week, monthKey());
        this.save.addCoins(ev.reward);
        this.challengeOutcome = `${ev.icon} ${ev.name} clear ×${counts.week} · +${ev.reward} coins`;
        this.hud.toast(this.challengeOutcome, "gold");
        this.audio.eventStinger();
        // Monthly theme trail: 3 event clears inside the month.
        const th = monthlyTheme();
        if (counts.month >= THEME_TRAIL_CLEARS && this.save.claimThemeTrail(th.month)) {
          if (this.save.ownTrail(th.prizeTrail)) {
            this.hud.toast(`${th.icon} ${th.name} · ✨ ${TRAILS[th.prizeTrail]?.label ?? th.prizeTrail} trail unlocked!`, "gold");
          } else {
            this.save.addCoins(300);
            this.hud.toast(`${th.icon} ${th.name} complete · trail owned, +300 coins`, "gold");
          }
        }
      } else {
        this.challengeOutcome = `${ev.icon} ${ev.name} missed — needed ${ev.target.toLocaleString()} m`;
      }
    }

    // Mode mastery: every finished run banks progress; level-ups pay coins.
    const mastery = bankMasteryRun(this.save, this.modeId);
    if (mastery) {
      if (mastery.skill) {
        this.hud.toast(`★ ${this.mode.name} MASTERED · skill unlocked: ${mastery.skill.name} (${mastery.skill.desc}) · +${mastery.coins} coins`, "gold");
      } else {
        this.hud.toast(`${this.mode.icon} ${this.mode.name} mastery Lv.${mastery.level} · +2% coins in mode · +${mastery.coins} coins`, "gold");
      }
    }
    const score = this.score();
    this.save.recordRun(stats.distance, this.runCoins, score, this.today, this.island, this.terrain.biomeAt(this.bird.x).id);
    this.save.addLifetimeZeniths(stats.zenith);
    this.save.addLifetimeSunflowers(this.runSunflowers);
    // distance XP is awarded at the end; everything else accrued live during the flight
    this.awardXp(Math.round(stats.distance * XP_RULES.perMetre));
    const tierBefore = this.seasonPass.tier();
    this.flushXp();
    const tierAfter = this.seasonPass.tier();
    const xp = this.seasonPass.xp();
    const newTrophies = this.achievements.checkNew();
    this.checkPrizeSkins();

    this.telemetry.track("run_end", {
      distance: Math.round(stats.distance),
      score: Math.round(score),
      coins: this.runCoins,
      islands: stats.island,
      zeniths: stats.zenith,
      xp,
    });

    if (tierAfter > tierBefore) {
      this.hud.toast(`Nest Pass Lv.${tierAfter} unlocked — claim it!`, "gold");
      this.audio.island();
    }
    if (this.claimedQuests.length) {
      const total = this.claimedQuests.reduce((a, q) => a + q.reward, 0);
      this.hud.toast(`Quest complete · +${total} coins`, "quest");
    }
    if (this.newlyCompleted.length) this.hud.toast("Nest upgraded!", "island");
    for (const t of newTrophies) this.hud.toast(`Trophy: ${t.title}`, "gold");

    const runs = this.save.state.runsPlayed;
    const dueAd = !this.portalEnabled() && !this.save.state.gold && this.save.shouldShowInterstitial(runs);
    if (dueAd && !this.skipInterstitialOnce && this.ads.isAvailable()) {
      this.adReason = "interstitial";
      this.adTimer = this.ads.duration;
      this.telemetry.track("ad_shown", { reason: "interstitial" });
      this.setState("ad");
    } else {
      this.setState("gameover");
      this.maybeNudgeStarter();
    }
    this.skipInterstitialOnce = false;
  }

  /** Legend prize skin: reaching the top division earns the Solstice bird. */
  private checkDivisionPrize(): void {
    const div = divisionFor(this.save.state.rival.rating);
    if (div.id === "legend" && !this.save.state.ownedSkins.includes("solstice")) {
      this.save.ownSkin("solstice");
      this.hud.toast("🐦 Solstice unlocked — welcome to Sunbird Legend!", "gold");
      this.flash("perfect");
    }
  }

  private endAd(): void {
    this.save.recordAdImpression(this.save.state.runsPlayed);
    this.telemetry.track("ad_completed", { reason: this.adReason, left: this.save.adsLeftToday() });
    if (this.adReason === "continue") this.doContinue("ad");
    else this.setState("gameover");
  }

  /** Day rollover while the tab stays open: new hills, new quests, fresh streak. */
  private dayTick(raw: number): void {
    this.dayTimer += raw;
    if (this.dayTimer < 2) return;
    this.dayTimer = 0;
    const now = this.save.isVipActive();
    if (this.vipActive && !now) {
      this.vipActive = false;
      this.vipExpiredNotice = true;
      this.hud.toast("VIP expired — perks paused", "warn");
      this.telemetry.track("vip_expired", {});
      this.bump();
    } else if (!this.vipActive && now) {
      this.vipActive = true;
      this.bump();
    }
    const today = dateSeed();
    if (today === this.today) return;
    const yesterday = this.today;
    this.today = today;
    const reward = this.save.touchStreak(today, yesterday);
    const gift = this.save.claimVipDaily(today);
    // Monthly ranked season rollover: soft reset + peak-division reward.
    const seasonEnd = this.save.ensureRankSeason();
    if (seasonEnd) this.hud.toast(`⚔ Ranked season over · ${seasonEnd.division} reward +${seasonEnd.coins} coins`, "gold");
    // Only swap hills while resting in the menu — a midnight rollover mid-run
    // must never yank the terrain out from under a live flight.
    if (this.state === "menu" && this.seedMode === "today") this.rebuildWorld(today);
    if (reward > 0) this.hud.toast(`Day ${this.save.state.streak.days} streak · +${reward} coins`, "gold");
    if (gift > 0) this.hud.toast(`VIP daily gift · +${gift} coins`, "vip");
    this.hud.toast("New hills today", "island");
    this.telemetry.track("day_rollover", { date: today });
    this.bump();
  }

  private awardXp(amount: number): void {
    this.pendingXp += amount;
  }

  private flushXp(): void {
    if (this.pendingXp <= 0) return;
    this.seasonPass.addXp(this.pendingXp);
    this.pendingXp = 0;
  }

  private resetRun(idle: boolean): void {
    this.masteryPerk = masteryPerks(this.save, this.modeId);
    this.startX = 64;
    const y = this.terrain.heightAt(this.startX) + BIRD_RADIUS;
    this.bird.reset(this.startX, y);
    this.daylight = this.daylightMax();
    this.island = 0;
    this.lastIsland = 0;
    this.perfects = 0;
    this.perfectChain = 0;
    this.skimTime = 0;
    this.skimCd = 0;
    this.surprises.reset();
    this.feverTimer = 0;
    this.feverOn = false;
    this.feverReached = false;
    this.prevVy = 0;
    this.bonus = 0;
    this.scoreAccum = 0;
    this.splashCd = 0;
    this.hintTimer = 0;
    this.hint = idle ? "" : "HOLD to dive";
    this.runCoins = 0;
    this.runClouds = 0;
    this.zeniths = 0;
    this.pickups = 0;
    this.runRings = 0;
    this.ringChain = 0;
    this.ringChainTimer = 0;
    this.runBalloons = 0;
    this.runSunflowers = 0;
    this.pendingXp = 0;
    this.xpFlush = 0;
    this.trailFxAcc = 0;
    this.powerFxAcc = 0;
    this.trail.clear();
    this.atmosphereFxAcc = 0;
    this.magnetTimer = 0;
    this.shield = 0;
    this.boostTimer = 0;
    this.continuesUsed = 0;
    this.continueTimer = 0;
    this.timeScale = 1;
    this.zenithTimer = 0;
    this.hitStopTimer = 0;
    this.runRecorded = false;
    this.newlyCompleted = [];
    this.claimedQuests = [];
    this.menuHold = 0;
    this.needRelease = true;
    this.runTime = 0;
    this.ghostWasAhead = false;
    this.ghostPassed = false;
    this.lastBiomeId = idle ? "" : this.terrain.biomeAt(this.startX).id;
    this.ghostRecorder.reset();
    this.ghostPlayer.reset();
    if (!idle) this.ghostPlayer.load(this.seed);
    this.launch.reset();
    this.powers.reset();
    this.runGems = 0;
    this.recordBanner = "";
    this.goalPop = "";
    this.goalPopT = 0;
    this.terrain.setDifficulty(this.flow.difficulty());
    this.maxAltitude = 0;
    this.maxSpeed = 0;
    this.launchBannerT = 0;
    this.launchBannerText = "";
    this.lastLaunch = null;
    this.altZone = 0;
    this.countdown = 0;
    this.versusGrace = 5;
    this.collect.reset();
    this.weather.reset();
    // Skin-borne weather perks: weatherproof birds fly warded, stealth birds slip past hazards.
    this.weather.ward = this.skin.weatherProof ?? false;
    this.weather.stealth = this.skin.stealth ?? false;
    this.particles.clear();
    this.terrain.update(this.startX);
    if (idle) this.camera.setIntro(1);
    else this.camera.snapTo(this.bird);
  }

  /* --------------------------------------------------------------- actions */

  private handleAction(action: string, id: string): void {
    void this.audio.resume();
    switch (action) {
      case "mode-select":
        this.setScreen("modes");
        break;
      case "pick-mode":
        this.modeId = (id || "daytrip") as ModeId;
        this.mode = modeById(this.modeId);
        this.exitVersus();
        this.startRun();
        break;
      case "versus":
        this.startVersus();
        break;
      case "start":
        if (this.state !== "ad" && this.state !== "continue") this.startRun();
        break;
      case "retry":
        if (this.state !== "ad" && this.state !== "continue") {
          if (this.portalEnabled()) void this.restartWithPortalBreak();
          // Retrying keeps the flavour of the run you just flew: duels rematch,
          // an unfinished challenge gets another attempt, plain runs stay plain.
          else if (this.duelActive) this.startRun({ duel: true });
          else if (this.challengeRun === "daily" && !this.save.isDailyDone(this.today)) this.startRun({ challenge: "daily" });
          else if (this.challengeRun.startsWith("gauntlet")) {
            const idx = Number(this.challengeRun.slice(8)) || 0;
            if (!this.save.gauntletDone(weekKey()).includes(idx)) this.startRun({ challenge: this.challengeRun });
            else this.startRun();
          } else if (this.eventRun) this.startRun({ event: true });
          else this.startRun();
        }
        break;
      case "pause":
        if (this.state === "playing") this.setState("paused");
        break;
      case "resume":
        if (this.state === "paused") this.setState("playing");
        break;
      case "menu":
        this.exitVersus();
        this.goToMenu();
        break;
      case "open-shop":
        this.setScreen("shop");
        break;
      case "open-paywall":
        ensureStripeJs();
        if (this.portalEnabled()) {
          this.hud.toast("This portal edition uses only portal rewards", "info");
          break;
        }
        this.restoreMessage = "";
        this.setScreen("paywall");
        this.telemetry.track("paywall_open", { from: this.state });
        break;
      case "open-settings":
        this.setScreen("settings");
        break;
      case "open-scores":
        this.setScreen("scores");
        break;
      case "open-pass":
        this.flushXp();
        this.setScreen("pass");
        break;
      case "vip-dismiss":
        this.vipExpiredNotice = false;
        this.bump();
        break;
      case "open-trophies":
        this.setScreen("trophies");
        break;
      case "open-account":
        this.referralMessage = "";
        this.cloudMessage = "";
        this.setScreen("account");
        break;
      case "open-atlas":
        this.setScreen("atlas");
        break;
      case "open-board":
        this.setScreen("board");
        void this.refreshBoard();
        break;
      case "open-cups":
        this.setScreen("cups");
        break;
      case "board-scope":
        this.boardScope = (id as BoardScope) || "global";
        void this.refreshBoard();
        break;
      case "board-metric":
        this.boardMetric = (id as BoardMetric) || "distance";
        void this.refreshBoard();
        break;
      case "board-refresh":
        void this.refreshBoard(true);
        break;
      case "rename-pilot": {
        const next = savePilotName(this.hud.readValue("pilotName") || this.pilotName);
        this.pilotName = next;
        this.save.state.pilotName = next;
        this.save.persist();
        this.hud.toast(`Flying as ${next}`, "info");
        void this.refreshBoard(true);
        break;
      }
      case "claim-cup": {
        const grant = this.cups.claim(id);
        if (!grant) break;
        this.applyPrize(grant);
        break;
      }
      case "equip-trail":
        this.save.equipTrail(this.save.state.activeTrail === id ? "" : id);
        this.audio.ding();
        this.bump();
        break;
      case "race-40":
        this.modeId = "massrace";
        this.mode = modeById("massrace");
        this.exitVersus();
        this.startRun();
        break;
      case "emote":
        this.sendEmote(id || "👋");
        break;
      case "host-room": {
        this.roomCode = makeRoomCode();
        this.copyRoomInvite(this.roomCode);
        this.modeId = "massrace";
        this.mode = modeById("massrace");
        this.startRun();
        break;
      }
      case "join-room": {
        const code = normalizeRoomCode(this.hud.readValue("roomCode"));
        if (!code) {
          this.hud.toast("Enter a 5-letter room code", "warn");
          break;
        }
        this.roomCode = code;
        this.modeId = "massrace";
        this.mode = modeById("massrace");
        this.startRun();
        break;
      }
      case "copy-invite": {
        if (this.roomCode) this.copyRoomInvite(this.roomCode);
        else this.hud.toast("Host a room first to get an invite link", "warn");
        break;
      }
      case "start-room": {
        if (!this.roomCode) {
          this.hud.toast("Host or join a room first", "warn");
          break;
        }
        this.modeId = "massrace";
        this.mode = modeById("massrace");
        this.rankedRace = false;
        this.startRun();
        break;
      }
      case "quick-match":
      case "pvp-ranked":
        this.beginMatchmaking({ ranked: true, storm: false });
        break;
      case "pvp-storm":
        this.beginMatchmaking({ ranked: true, storm: true });
        break;
      case "mm-cancel":
        this.cancelMatchmaking();
        break;
      case "pvp-duel":
        this.roomCode = "";
        this.modeId = "massrace";
        this.mode = modeById("massrace");
        this.rankedRace = false;
        this.startRun({ duel: true });
        break;
      case "play-daily": {
        const c = dailyChallenge(this.today);
        if (this.save.isDailyDone(this.today)) {
          this.hud.toast("Today's challenge is already complete — back tomorrow!", "info");
          break;
        }
        this.modeId = c.mode;
        this.mode = modeById(c.mode);
        this.exitVersus();
        this.startRun({ challenge: "daily" });
        break;
      }
      case "play-gauntlet": {
        const idx = Math.max(0, Math.min(2, parseInt(id || "0", 10) || 0));
        const g = weeklyGauntlet(weekKey());
        if (this.save.gauntletDone(g.week).includes(idx)) {
          this.hud.toast("Stage already cleared this week", "info");
          break;
        }
        const st = g.stages[idx]!;
        this.modeId = st.mode;
        this.mode = modeById(st.mode);
        this.exitVersus();
        this.startRun({ challenge: `gauntlet${idx}` as `gauntlet${number}` });
        break;
      }
      case "claim-calendar": {
        const day = this.save.claimCalendar(this.today);
        if (day === 0) {
          this.hud.toast("Today's gift is already claimed", "info");
          break;
        }
        const r = calendarReward(day);
        if (r.kind === "coins") {
          this.save.addCoins(r.amount);
          this.hud.toast(`📅 Day ${day} gift · +${r.amount} coins`, "gold");
        } else if (r.kind === "boost") {
          this.save.armBoost(r.id);
          this.hud.toast(`📅 Day ${day} gift · boost armed for next flight`, "gold");
        } else {
          if (this.save.ownTrail(r.id)) this.hud.toast(`📅 Day ${day} gift · ✨ ${TRAILS[r.id]?.label ?? r.id} trail!`, "gold");
          else {
            this.save.addCoins(200);
            this.hud.toast(`📅 Day ${day} · trail already owned, +200 coins instead`, "gold");
          }
        }
        this.audio.purchase();
        this.bump();
        break;
      }
      case "open-challenges":
        this.setScreen("challenges");
        break;
      case "play-event": {
        this.modeId = "daytrip";
        this.mode = modeById("daytrip");
        this.exitVersus();
        this.startRun({ event: true });
        break;
      }
      case "open-campaign":
        this.setScreen("campaign");
        break;
      case "claim-campaign": {
        const ch = CAMPAIGN.find((c) => c.id === id);
        if (!ch) break;
        const view = campaignViews(this.save, this.save.state.campaignClaimed).find((v) => v.def.id === id);
        if (!view || !view.unlocked || !view.complete || !this.save.claimCampaign(id)) {
          this.hud.toast("Chapter not ready yet", "info");
          break;
        }
        this.save.addCoins(ch.rewardCoins);
        this.hud.toast(`${ch.icon} ${ch.title} · +${ch.rewardCoins} coins — ${ch.rewardLabel}`, "gold");
        this.audio.chapterFanfare();
        this.bump();
        break;
      }
      case "open-squad":
        this.setScreen("squad");
        this.squadNotice = "";
        void this.squad?.refresh();
        break;
      case "squad-refresh":
        this.squadNotice = "";
        void this.squad?.refresh();
        break;
      case "squad-add": {
        const code = this.hud.readValue("squadCode").trim().toUpperCase();
        if (!code) break;
        void this.squad?.addFriend(code).then((msg) => {
          this.squadNotice = msg;
          this.bump();
        });
        break;
      }
      case "squad-remove":
        void this.squad?.removeFriend(id);
        break;
      case "squad-create-club": {
        const name = this.hud.readValue("clubName").trim();
        if (!name) {
          this.hud.toast("Give your club a name first", "info");
          break;
        }
        void this.squad?.createClub(name, "Fly together, land badly").then((msg) => {
          this.squadNotice = msg;
          this.bump();
        });
        break;
      }
      case "squad-join-club":
        void this.squad?.joinClub(parseInt(id, 10) || 0).then((msg) => {
          this.squadNotice = msg;
          this.bump();
        });
        break;
      case "squad-leave-club":
        void this.squad?.leaveClub();
        break;
      case "squad-chat": {
        const text = this.hud.readValue("chatText");
        void this.squad?.sendChat(text).then(() => this.bump());
        break;
      }
      case "room-size": {
        const n = Math.max(5, Math.min(40, parseInt(id || "40", 10) || 40));
        this.roomSize = n;
        this.hud.toast(`Field size · ${n} rivals`, "info");
        this.bump();
        break;
      }
      case "room-skill":
        this.roomSkill = (id as "chill" | "sharp" | "ace") || "sharp";
        this.massRace.setFieldSkill(this.roomSkill === "ace" ? 1.25 : this.roomSkill === "chill" ? 0.7 : 1);
        this.hud.toast(`Rival skill · ${this.roomSkill}`, "info");
        this.bump();
        break;
      case "room-shuffle":
        this.massRace.shuffle(`${this.seed}:${this.modeId}`);
        this.hud.toast("Field shuffled", "info");
        this.audio.ding();
        this.bump();
        break;
      case "room-kick":
        if (this.massRace.kick(id)) {
          this.hud.toast("Pilot removed from room", "warn");
          this.audio.butter();
        } else {
          this.hud.toast("Pilot already gone", "warn");
        }
        this.bump();
        break;
      case "room-mute":
        this.roomMuted = !this.roomMuted;
        this.hud.toast(this.roomMuted ? "Emotes muted" : "Emotes on", "info");
        this.bump();
        break;
      case "room-close":
        this.massRace.clear();
        this.roomCode = "";
        this.hud.toast("Room closed", "warn");
        this.bump();
        break;
      case "pvp-casual":
        this.beginMatchmaking({ ranked: false, storm: false });
        break;
      case "pvp-practice":
        this.exitVersus();
        this.modeId = "daytrip";
        this.mode = modeById("daytrip");
        this.startRun();
        break;
      case "open-rank":
        this.setScreen("rank");
        break;
      case "open-live":
        this.setScreen("live");
        // Seat into the public room immediately so the lobby shows real
        // pilots before you commit — PvP should feel alive from the lobby.
        this.preseatLobby();
        break;
      case "back":
        this.checkoutOk = false;
        this.checkoutWaiting = false;
        this.setScreen(this.screen === "checkout" ? "paywall" : "main");
        break;
      case "buy-nest": {
        const price = this.save.nestUpgradePrice();
        if (this.save.buyNestUpgrade()) {
          this.audio.fanfare();
          this.hud.toast(`Nest upgraded → ×${this.save.nestMultiplier().toFixed(2)} score forever`, "gold");
        } else {
          this.hud.toast(this.save.state.nestBought >= 10 ? "Nest is fully upgraded" : `Need ● ${price}`, "info");
        }
        this.bump();
        break;
      }
      case "buy-skin":
        this.buySkin(id);
        break;
      case "equip-skin":
        this.save.equipSkin(id);
        this.applySkin();
        this.audio.ding();
        this.bump();
        break;
      case "buy-boost":
        this.buyBoost(id);
        break;
      case "buy-trail":
        this.buyTrail(id);
        break;
      case "starter-buy":
        if (this.portalEnabled() || this.save.state.starterPack) break;
        this.openCheckout("sunbird_starter");
        break;
      case "gold-buy":
        if (this.portalEnabled()) break;
        this.openCheckout("sunbird_gold");
        break;
      case "vip-buy":
        if (this.portalEnabled()) break;
        this.openCheckout("sunbird_vip");
        break;
      case "checkout-pay":
        this.payDemo();
        break;
      case "checkout-cancel":
        if (!this.checkoutBusy) this.setScreen("paywall");
        break;
      case "stripe-open":
        this.openStripeTab();
        break;
      case "stripe-confirm":
        this.confirmStripeManually();
        break;
      case "restore":
        this.restore();
        break;
      case "redeem":
        this.redeem();
        break;
      case "copy-referral":
        void navigator.clipboard?.writeText(this.save.state.referralCode);
        this.hud.toast("Code copied", "info");
        break;
      case "redeem-referral":
        this.redeemReferral();
        break;
      case "copy-cloud":
        void navigator.clipboard?.writeText(this.save.exportCode());
        this.hud.toast("Save code copied", "info");
        break;
      case "import-cloud":
        this.importCloud();
        break;
      case "throw-challenge": {
        // Challenge link: this exact seed + this run's distance. Every player
        // becomes a course designer with a posted time.
        const dist = Math.max(1, Math.round(this.lastRunDistance()));
        const url = buildChallengeUrl(this.seed, dist, this.pilotName);
        void navigator.clipboard
          .writeText(`Beat ${dist} m on my hills → ${url}`)
          .then(() => this.hud.toast("🥊 Challenge link copied — send it to a rival", "gold"))
          .catch(() => this.hud.toast(url, "info"));
        this.telemetry.track("rival_thrown", { distance: dist });
        break;
      }
      case "rematch":
        // Same stakes, zero menu round-trips — back through the honest
        // search so live pilots can seat into the new field.
        if (this.state === "gameover" && this.lastMatchOpts) this.beginMatchmaking(this.lastMatchOpts);
        break;
      case "share":
        void this.shareRun();
        break;
      case "install-app":
        void this.installApp();
        break;
      case "continue-coins":
        if (this.state === "continue" && this.save.spend(CONTINUE_COST)) this.doContinue("coins");
        break;
      case "continue-ad":
        if (this.state === "continue") {
          if (this.portalEnabled()) {
            void this.continueWithPortalReward();
          } else {
            this.adReason = "continue";
            this.adTimer = this.ads.duration;
            this.telemetry.track("ad_shown", { reason: "continue" });
            this.setState("ad");
          }
        }
        break;
      case "continue-gold":
        if (this.state === "continue" && this.save.state.gold) this.doContinue("gold");
        break;
      case "continue-sleep":
        if (this.state === "continue") this.finishRun();
        break;
      case "ad-skip":
        if (this.state === "ad" && this.adTimer <= 0) this.endAd();
        break;
      case "ad-gold":
        if (this.state === "ad") {
          if (this.adReason === "continue") {
            this.skipInterstitialOnce = true;
            this.finishRun();
          } else {
            this.setState("gameover");
          }
          this.restoreMessage = "";
          this.setScreen("paywall");
          this.telemetry.track("paywall_open", { from: "ad" });
        }
        break;
      case "claim-pass-free":
        this.claimPass(Number(id), "free");
        break;
      case "claim-pass-premium":
        this.claimPass(Number(id), "premium");
        break;
      case "set-mute":
        this.save.state.settings.mute = !this.save.state.settings.mute;
        this.save.persist();
        this.applySettings();
        break;
      case "set-music":
        this.save.state.settings.music = !this.save.state.settings.music;
        this.save.persist();
        this.applySettings();
        break;
      case "set-music-vol": {
        const cur = this.save.state.settings.musicVolume;
        const next = cur >= 1 ? 0 : Math.round((cur + 0.25) * 100) / 100;
        this.save.state.settings.musicVolume = next;
        this.save.persist();
        this.applySettings();
        break;
      }
      case "set-sfx-vol": {
        const cur = this.save.state.settings.sfxVolume;
        const next = cur >= 1 ? 0 : Math.round((cur + 0.25) * 100) / 100;
        this.save.state.settings.sfxVolume = next;
        this.save.persist();
        this.applySettings();
        this.audio.ding();
        break;
      }
      case "set-haptics":
        this.save.state.settings.haptics = !this.save.state.settings.haptics;
        this.save.persist();
        this.bump();
        break;
      case "set-motion":
        this.save.state.settings.reduceMotion = !this.save.state.settings.reduceMotion;
        this.save.persist();
        this.applySettings();
        break;
      case "set-colorassist":
        this.save.state.settings.colorAssist = !this.save.state.settings.colorAssist;
        this.save.persist();
        this.applySettings();
        break;
      case "set-bigtext":
        this.save.state.settings.bigText = !this.save.state.settings.bigText;
        this.save.persist();
        this.applySettings();
        break;
      case "set-quality": {
        const order = ["auto", "high", "low"] as const;
        const cur = this.save.state.settings.quality;
        this.save.state.settings.quality = order[(order.indexOf(cur) + 1) % order.length]!;
        this.save.persist();
        this.applySettings();
        break;
      }
      case "reset-progress":
        if (!this.resetArmed) {
          this.resetArmed = true;
          this.resetTimer = 3;
        } else {
          this.resetArmed = false;
          this.save.resetProgress();
          this.applySkin();
          this.applySettings();
          this.hud.toast("Progress reset", "warn");
          this.telemetry.track("progress_reset", {});
        }
        this.bump();
        break;
      case "seed-today":
        this.setSeedMode("today");
        break;
      case "seed-yesterday":
        this.setSeedMode("yesterday");
        break;
      case "seed-random":
        this.setSeedMode("random");
        break;
      default:
        break;
    }
  }

  private handleHotkeys(): void {
    if (this.input.consumePause()) {
      if (this.state === "playing") this.setState("paused");
      else if (this.state === "paused") this.setState("playing");
      else if (this.screen !== "main" && !this.checkoutBusy) this.setScreen("main");
    }
    if (this.input.consumeRestart()) {
      if (this.state === "gameover") {
        if (this.portalEnabled()) void this.restartWithPortalBreak();
        else this.startRun();
      } else if (this.state === "playing" || this.state === "paused") {
        this.startRun();
      }
    }
  }

  private goToMenu(): void {
    if (this.state === "playing" || this.state === "paused") {
      this.telemetry.track("run_abandon", { distance: Math.round(this.bird.x - this.startX) });
      // Quitting a ranked duel mid-flight counts as the loss it is.
      if (this.duelActive && this.duelResult === "" && !this.runRecorded && this.runTime > 3) {
        const res = this.save.recordDuelResult(false, this.today);
        this.hud.toast(`⚔ Duel forfeited · ${res.delta} rating`, "warn");
      }
      // A graceful retreat still deserves a punchline.
      this.hud.toast(quip(SURRENDER_QUIPS, Math.round(this.bird.x)), "cloud");
    }
    this.duelActive = false;
    this.duelResult = "";
    this.challengeRun = "";
    this.challengeMods = NO_MODS;
    this.resetRun(true);
    this.setState("menu");
    this.setScreen("main");
    this.camera.setIntro(1);
  }

  private buySkin(id: string): void {
    const def = skinById(id);
    const st = this.save.state;
    if (def.prizeOnly && !st.ownedSkins.includes(id)) {
      this.hud.toast(`🏆 Earn it: ${def.prizeOnly}`, "info");
      return;
    }
    if ((def.goldOnly && !st.gold) || (def.vipOnly && !st.vip)) {
      this.setScreen("paywall");
      return;
    }
    if (st.ownedSkins.includes(id)) {
      this.save.equipSkin(id);
      this.applySkin();
      this.bump();
      return;
    }
    if (!this.save.spend(def.price)) {
      this.hud.toast(`Need ${def.price - st.wallet} more coins`, "warn");
      return;
    }
    this.save.ownSkin(id);
    this.save.equipSkin(id);
    this.applySkin();
    this.audio.purchase();
    this.hud.toast(`${def.name} is yours!`, "gold");
    this.telemetry.track("skin_bought", { id, price: def.price });
    this.bump();
  }

  private buyBoost(id: string): void {
    const def = BOOSTS.find((b) => b.id === id);
    if (!def) return;
    const st = this.save.state;
    if (st.armedBoosts.includes(id)) {
      this.hud.toast("Already armed for next flight", "info");
      return;
    }
    const deal = dailyDealBoost(this.today);
    const price = def.id === deal.id ? deal.price : def.price;
    if (!this.save.spend(price)) {
      this.hud.toast(`Need ${price - st.wallet} more coins`, "warn");
      return;
    }
    this.save.armBoost(id);
    this.audio.purchase();
    this.hud.toast(`${def.icon} ${def.name} armed`, "power");
    this.telemetry.track("boost_bought", { id, price });
    this.bump();
  }

  private buyTrail(id: string): void {
    const def = SHOP_TRAILS.find((t) => t.id === id);
    if (!def) return;
    const st = this.save.state;
    if (st.tournaments.trails.includes(id)) {
      // already owned → toggle equip
      this.save.equipTrail(st.activeTrail === id ? "" : id);
      this.audio.ding();
      this.bump();
      return;
    }
    if (!this.save.spend(def.price)) {
      this.hud.toast(`Need ${def.price - st.wallet} more coins`, "warn");
      return;
    }
    this.save.ownTrail(id);
    this.save.equipTrail(id);
    this.audio.purchase();
    this.hud.toast(`${def.label} trail is yours!`, "gold");
    this.telemetry.track("trail_bought", { id, price: def.price });
    this.bump();
  }

  private claimPass(tier: number, track: "free" | "premium"): void {
    const reward = this.seasonPass.claim(tier, track);
    if (!reward) {
      if (track === "premium" && !this.save.state.gold) this.setScreen("paywall");
      return;
    }
    this.audio.ding();
    this.hud.toast(`Tier ${tier} reward claimed!`, "gold");
    this.bump();
  }

  /* ----------------------------------------------------------- checkout */

  private openCheckout(sku: Sku): void {
    if (this.portalEnabled()) return;
    this.checkoutSku = sku;
    this.checkoutError = "";
    this.checkoutOk = false;
    this.checkoutWaiting = false;
    this.setScreen("checkout");
    this.telemetry.track("checkout_open", { sku, mode: this.checkoutMode() });
  }

  private checkoutMode(): CheckoutMode {
    return stripeConfigured(this.checkoutSku) ? "stripe" : "demo";
  }

  private payDemo(): void {
    if (this.checkoutBusy) return;
    this.checkoutBusy = true;
    this.checkoutError = "";
    this.bump();
    this.telemetry.track("checkout_start", { sku: this.checkoutSku, mode: "demo" });
    void this.mockPayments.purchase(this.checkoutSku).then((res) => {
      if (this.disposed) return;
      this.checkoutBusy = false;
      if (res.ok) {
        this.checkoutOk = true;
        this.grantSku(this.checkoutSku, "demo_purchase");
      } else {
        this.checkoutError = res.error;
        this.telemetry.track("purchase_fail", { error: res.error });
      }
      this.bump();
    });
  }

  private openStripeTab(): void {
    // Portals forbid external payment links, full stop. The entry actions are
    // gated too, but this is the hard backstop for any future code path.
    if (this.portalEnabled()) return;
    const link = stripeLinkFor(this.checkoutSku, this.save.state.deviceId);
    if (!link) return;
    window.open(link, "_blank", "noopener,noreferrer");
    this.checkoutWaiting = true;
    this.telemetry.track("checkout_start", { sku: this.checkoutSku, mode: "stripe" });
    this.bump();
  }

  private confirmStripeManually(): void {
    const res = this.mockPayments.confirmManual(this.checkoutSku);
    if (res.ok) {
      this.checkoutOk = true;
      this.grantSku(this.checkoutSku, "stripe_selfserve");
    }
    this.bump();
  }

  /** The one honest upsell moment: after the player proves they like the
   * game (run 3+), surface the starter pack ONCE per session at the results
   * screen — never mid-run, never modal, never repeated. */
  private starterNudged = false;
  private maybeNudgeStarter(): void {
    if (this.starterNudged || this.portalEnabled()) return;
    if (this.save.state.starterPack || this.save.state.gold) return;
    const runs = this.save.state.runsPlayed;
    if (runs < 3 || runs > 12) return;
    this.starterNudged = true;
    this.hud.toast(`🎁 First Flight Pack · ${STARTER_PACK.price} — 1,200 coins + Goldleaf trail`, "gold");
    this.telemetry.track("starter_nudge", { runs });
  }

  private handleStripeReturn(): void {
    const sku = consumeStripeReturn();
    if (!sku) return;
    this.grantSku(sku, "stripe_redirect");
    this.checkoutSku = sku;
    this.checkoutOk = true;
    this.setScreen("checkout");
    this.setState("menu");
  }

  private grantSku(sku: Sku, source: string): void {
    if (sku === "sunbird_vip") this.grantVip(source);
    else if (sku === "sunbird_starter") this.grantStarter(source);
    else this.grantGold(source);
  }

  private grantStarter(source: string): void {
    if (this.save.state.starterPack) return;
    this.save.state.starterPack = true;
    this.save.addCoins(STARTER_PACK.coins);
    this.save.ownTrail(STARTER_PACK.trailId);
    this.save.equipTrail(STARTER_PACK.trailId);
    this.save.armBoost("sunflask");
    this.audio.fanfare();
    this.hud.toast(`🎁 First Flight Pack — +${STARTER_PACK.coins} coins, Goldleaf trail, Sun Flask armed`, "gold");
    this.telemetry.track("purchase_ok", { sku: "sunbird_starter", source });
    this.bump();
  }

  private restore(): void {
    this.restoreMessage = "Checking…";
    this.bump();
    void this.mockPayments.restore().then((skus) => {
      if (this.disposed) return;
      let found = false;
      if (skus.includes("sunbird_gold") && !this.save.state.gold) {
        this.grantGold("restore");
        found = true;
      }
      if (skus.includes("sunbird_vip") && !this.save.isVipActive()) {
        this.grantVip("restore");
        found = true;
      }
      this.restoreMessage = found || this.save.state.gold || this.save.isVipActive() ? "Purchases restored ✦" : "No purchases found on this device.";
      this.bump();
    });
  }

  private redeem(): void {
    const code = this.hud.readValue("redeem").trim().toUpperCase();
    if (!code) return;
    const promo = PROMO_CODES[code];
    if (!promo) {
      this.restoreMessage = "Hmm, that code isn't valid.";
    } else if (!this.save.redeem(code)) {
      this.restoreMessage = "That code was already used.";
    } else if (promo.type === "gold") {
      this.grantGold("promo");
      this.restoreMessage = "Gold unlocked with code ✦";
    } else if (promo.type === "vip") {
      this.grantVip("promo");
      this.restoreMessage = "VIP unlocked with code ♛";
    } else {
      this.save.addCoins(promo.amount);
      this.audio.ding();
      this.restoreMessage = `+${promo.amount} coins added.`;
    }
    this.telemetry.track("promo_redeem", { code, ok: Boolean(promo) });
    this.bump();
  }

  private redeemReferral(): void {
    const code = this.hud.readValue("friendcode");
    if (this.save.redeemReferral(code)) {
      this.save.addCoins(REFERRAL_BONUS);
      this.audio.ding();
      this.particles.emitConfetti(this.bird.x, this.bird.y);
      this.referralMessage = `Welcome bonus applied · +${REFERRAL_BONUS} coins`;
      this.telemetry.track("referral_redeemed", {});
    } else {
      this.referralMessage = "That code doesn't look right (or you've already used one).";
    }
    this.bump();
  }

  private importCloud(): void {
    const code = this.hud.readValue("cloudImport");
    if (!code.trim()) return;
    if (this.save.importCode(code)) {
      this.applySkin();
      this.applySettings();
      this.cloudMessage = "Save imported! Welcome back.";
      this.telemetry.track("cloud_import", { ok: true });
    } else {
      this.cloudMessage = "That code couldn't be read.";
      this.telemetry.track("cloud_import", { ok: false });
    }
    this.bump();
  }

  private async shareRun(): Promise<void> {
    if (this.shareBusy) return;
    this.shareBusy = true;
    this.bump();
    try {
      const card = await buildShareCard({
        distance: Math.max(0, this.bird.x - this.startX),
        coins: this.runCoins,
        score: this.score(),
        skin: this.skin,
        referralCode: this.save.state.referralCode,
        seedLabel: this.seedLabel(),
      });
      const result = await shareOrDownload(card, undefined, !this.portalEnabled());
      this.telemetry.track("share_run", { result });
      this.hud.toast(result === "shared" ? "Shared!" : "Image saved", "info");
    } catch {
      this.hud.toast("Couldn't build the share card", "warn");
    } finally {
      this.shareBusy = false;
      this.bump();
    }
  }

  private async installApp(): Promise<void> {
    if (!this.deferredInstall) return;
    await this.deferredInstall.prompt();
    this.deferredInstall = null;
    this.bump();
  }

  private grantGold(source: string): void {
    this.save.setGold(true);
    this.save.ownSkin("phoenix");
    this.audio.purchase();
    this.particles.emitConfetti(this.bird.x, this.bird.y + 3);
    this.hud.toast("Welcome to Gold ✦", "gold");
    this.telemetry.track("gold_granted", { source });
    this.bump();
  }

  private grantVip(source: string): void {
    this.save.grantVip();
    this.vipActive = true;
    this.vipExpiredNotice = false;
    this.save.ownSkin("aurora");
    this.save.claimVipDaily(this.today);
    this.audio.purchase();
    this.particles.emitConfetti(this.bird.x, this.bird.y + 3);
    this.hud.toast("Welcome to VIP ♛", "vip");
    this.telemetry.track("vip_granted", { source });
    this.bump();
  }

  private setSeedMode(mode: SeedMode): void {
    if (!this.save.state.gold && mode !== "today") {
      this.setScreen("paywall");
      return;
    }
    this.seedMode = mode;
    const seed =
      mode === "today" ? this.today : mode === "yesterday" ? dateSeed(new Date(Date.now() - 86400000)) : `wild-${Math.random().toString(36).slice(2, 8)}`;
    this.rebuildWorld(seed);
    this.telemetry.track("seed_change", { mode });
    this.bump();
  }

  private rebuildWorld(seed: string): void {
    this.seed = seed;
    this.scene.remove(this.terrain.group);
    this.terrain.dispose();
    this.scene.remove(this.collect.group);
    this.collect.dispose();
    this.scene.remove(this.weather.group);
    this.weather.dispose();
    this.terrain = new TerrainSystem(seed);
    this.scene.add(this.terrain.group);
    this.collect = new Collectibles(this.terrain.seedN);
    this.scene.add(this.collect.group);
    this.weather = new Weather(this.terrain.seedN);
    this.weather.addTo(this.scene);
    this.resetRun(true);
  }

  /* --------------------------------------------------------------- helpers */

  private get skin(): SkinDef {
    return skinById(this.save.state.activeSkin);
  }

  private daylightMax(): number {
    return (this.save.state.gold ? DAYLIGHT_MAX_GOLD : DAYLIGHT_MAX) + this.skin.daylightBonus + this.masteryPerk.daylightBonus;
  }

  private applySkin(): void {
    const s = this.skin;
    this.bird.applySkin({ body: s.body, wing: s.wing, belly: s.belly, beak: s.beak });
  }

  private applySettings(): void {
    const s = this.save.state.settings;
    this.audio.setMuted(s.mute);
    this.audio.setMusicEnabled(s.music);
    this.audio.setVolumes(s.musicVolume, s.sfxVolume);
    this.camera.setReduceMotion(s.reduceMotion);
    // Bloom is the expensive effect — desktop high/auto only, and never under
    // reduced-motion (a steady glow reads as flicker to some players).
    this.useBloom = !s.reduceMotion && !this.isMobile && s.quality !== "low";
    if (!this.useBloom) this.fx.setBase(0);
    // Accessibility classes live on <html> so every overlay inherits them.
    document.documentElement.classList.toggle("a11y-color", s.colorAssist);
    document.documentElement.classList.toggle("a11y-bigtext", s.bigText);
    this.dpr = this.preferredDpr();
    this.particleBudget = s.quality === "low" ? 0.4 : 1;
    this.particles.setBudget(this.particleBudget);
    // Soft shadows are the single priciest feature on mobile GPUs — keep them
    // only when the user asked for high quality (auto tiers shed them first).
    const wantShadows = s.quality === "high" || (s.quality === "auto" && this.frameEma < 1 / 30);
    if (this.renderer.shadowMap.enabled !== wantShadows) this.renderer.shadowMap.enabled = wantShadows;
    this.resize();
    this.bump();
  }

  private preferredDpr(): number {
    const dev = Math.min(window.devicePixelRatio || 1, 2);
    return this.save.state.settings.quality === "low" ? 1 : dev;
  }

  private adaptQuality(raw: number): void {
    this.frameEma = lerp(this.frameEma, raw, 0.05);
    this.qualityTimer += raw;
    if (this.qualityTimer < 2.5) return;
    this.qualityTimer = 0;
    if (this.save.state.settings.quality !== "auto" || this.state !== "playing") return;
    if (this.frameEma > 1 / 40) {
      if (this.dpr > 1) {
        this.dpr = Math.max(1, this.dpr - 0.25);
        this.resize();
        this.telemetry.track("quality_step_down", { dpr: this.dpr });
      }
      // At the floor resolution already? Kill soft shadows for the frame budget.
      if (this.renderer.shadowMap.enabled) {
        this.renderer.shadowMap.enabled = false;
        this.telemetry.track("shadows_disabled", {});
      }
      if (this.particleBudget > 0.3) {
        this.particleBudget = Math.max(0.3, this.particleBudget - 0.2);
        this.particles.setBudget(this.particleBudget);
      }
    } else if (this.frameEma < 1 / 58 && this.renderer.shadowMap.enabled === false && this.save.state.settings.quality === "auto") {
      // Headroom is back — restore soft shadows (they were only shed under load).
      this.renderer.shadowMap.enabled = true;
      this.particleBudget = Math.min(1, this.particleBudget + 0.2);
      this.particles.setBudget(this.particleBudget);
    }
  }

  private shake(amount: number): void {
    this.camera.bump(amount);
  }

  /** Ambient bloom from game state, refreshed once per rendered frame. */
  private updateGlowBase(): void {
    if (!this.useBloom) return;
    const golden = this.goldenHour ? 0.4 : 0;
    const fever = this.feverOn ? 0.5 : 0;
    const wings = this.powers.has("goldenwings") ? 0.45 : 0;
    const boost = this.boostTimer > 0 ? 0.25 : 0;
    this.fx.setBase(0.1 + Math.max(golden, fever, wings, boost));
  }

  /** Transient bloom spike on a trigger moment. */
  private glow(amount: number): void {
    if (!this.useBloom) return;
    this.fx.pulse(amount);
  }

  private flash(kind: "perfect" | "fever" | "island" | "sleep"): void {
    if (this.save.state.settings.reduceMotion && kind !== "sleep") return;
    this.hud.flash(kind);
  }

  private haptic(pattern: number | number[]): void {
    if (!this.save.state.settings.haptics) return;
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* unsupported */
    }
  }

  /** The SDK owns ad focus. Silence and freeze immediately, then restore only
   * after the callback so portal ads cannot leak game audio/input beneath them. */
  private beginPortalAd(): void {
    this.input.setEnabled(false);
    this.audio.setAdMuted(true);
  }

  private endPortalAd(): void {
    this.audio.setAdMuted(false);
    this.input.setEnabled(true);
  }

  private portalEnabled(): boolean {
    return isPortalBuild();
  }

  /* ------------------------------------------------------- live multiplayer */

  /* ------------------------------------------------------- matchmaking */

  /**
   * Honest search phase (the pattern every live racer uses):
   *  1. connect to the public room and WAIT — up to MM_WINDOW seconds;
   *  2. if enough real pilots are seated, launch immediately;
   *  3. on timeout, launch anyway — remaining slots backfill with
   *     leaderboard ghosts + squadron pilots, clearly labeled.
   * Cancelable at any moment; canceling never kicks you from the room.
   */
  private static readonly MM_WINDOW = 8;
  private static readonly MM_LAUNCH_AT = 4; // enough humans → go now

  private beginMatchmaking(opts: { ranked: boolean; storm: boolean }): void {
    this.roomCode = "";
    if (!isMultiplayerConfigured()) {
      // No server configured: skip the theater, launch with bots honestly.
      this.launchMatch(opts);
      return;
    }
    this.mmOpts = opts;
    this.mmDeadline = performance.now() + Game.MM_WINDOW * 1000;
    this.preseatLobby();
    this.hud.setMatchmaking(true, this.liveCount(), this.roomSize, Game.MM_WINDOW);
    this.bump();
  }

  private cancelMatchmaking(): void {
    this.mmDeadline = 0;
    this.mmOpts = null;
    this.hud.setMatchmaking(false, 0, this.roomSize, 0);
    this.bump();
  }

  private liveCount(): number {
    const info = this.net?.info();
    return info && this.net?.connected ? Math.max(0, info.count - 1) : 0;
  }

  /** Called every frame while a search is active. */
  private pumpMatchmaking(_raw: number): void {
    if (this.mmDeadline <= 0 || !this.mmOpts) return;
    const secsLeft = (this.mmDeadline - performance.now()) / 1000;
    const live = this.liveCount();
    this.hud.setMatchmaking(true, live, this.roomSize, Math.max(0, secsLeft));
    const enough = live + 1 >= Math.min(Game.MM_LAUNCH_AT, this.roomSize + 1);
    if (enough || secsLeft <= 0) {
      const opts = this.mmOpts;
      this.mmOpts = null;
      this.mmDeadline = 0;
      this.hud.setMatchmaking(false, live, this.roomSize, 0);
      if (live > 0) this.hud.toast(`${live} live pilot${live === 1 ? "" : "s"} in the field`, "gold");
      else this.hud.toast("No live pilots right now — flying player ghosts", "info");
      this.launchMatch(opts);
    }
  }

  private launchMatch(opts: { ranked: boolean; storm: boolean }): void {
    this.lastMatchOpts = opts;
    this.modeId = "massrace";
    this.mode = modeById("massrace");
    this.rankedRace = opts.ranked;
    this.stormfront = opts.storm;
    this.startRun({ storm: opts.storm });
  }

  /** Pre-seats the lobby so the Race screen shows live pilots immediately. */
  private preseatLobby(): void {
    if (!isMultiplayerConfigured()) return;
    // Warm the ghost source too so the next grid can seat real names.
    void this.refreshBoard();
    // Join with the massrace seed WITHOUT mutating the current mode — the
    // player may still back out and start a plain 1P flight.
    if (!this.net) {
      this.net = new RealtimeClient(this.save.state.deviceId, this.pilotName, this.skin.id, 0.06);
      this.massRace.attachTransport(this.net);
    }
    this.net.setIdentity(this.racedName(), this.skin.id, 0.06);
    this.net.connect(this.roomCode, `${this.seed}:massrace`);
  }

  /** Opens (or reuses) a realtime seat for the current race seed. */
  private connectRace(): void {
    if (!isMultiplayerConfigured()) return;
    if (!this.net) {
      this.net = new RealtimeClient(this.save.state.deviceId, this.pilotName, this.skin.id, 0.06);
      this.massRace.attachTransport(this.net);
    }
    this.net.setIdentity(this.racedName(), this.skin.id, 0.06);
    this.net.connect(this.roomCode, `${this.seed}:${this.modeId}`);
  }

  private disconnectRace(): void {
    this.net?.disconnect();
    this.massRace.attachTransport(null);
  }

  /** Per-frame network pump: cadence, inbound emotes, outbound state. */
  private pumpNetwork(raw: number): void {
    const net = this.net;
    if (!net) return;
    net.tick(raw);
    // Server-authoritative result: the DO ordered every live pilot's finish.
    // Blend it with the local bot field — humans ranked by the referee, bots
    // by simulation — and correct the shown place if the estimate was off.
    if (!this.serverPlaceApplied && net.myPlace > 0 && this.raceFinishTime > 0 && this.massRace.active) {
      this.serverPlaceApplied = true;
      const botsAhead = this.massRace.rivals.filter(
        (r) => r.kind === "local" && r.finished && r.finishTime <= this.runTime,
      ).length;
      const official = net.myPlace + botsAhead;
      if (official !== this.racePlace) {
        this.racePlace = official;
        this.hud.toast(`Official result: P${official} (server-verified)`, "gold");
        this.bump();
      }
    }
    for (const e of net.drainEmotes()) this.massRace.showEmote(e.id, e.emote);
    // Live multiplayer signals: surface presence changes as in-flight toasts
    // so a connecting/leaving/finishing rival never goes unnoticed.
    for (const e of net.drainEvents()) {
      switch (e.type) {
        case "join":
          this.hud.toast(`🕊 ${e.name} joined the race`, "island");
          this.audio.chirp();
          break;
        case "leave":
          this.hud.toast(`👋 ${e.name} left`, "warn");
          break;
        case "ready":
          this.hud.toast(`✅ ${e.name} is ready`, "cloud");
          break;
        case "finish":
          this.hud.toast(`🏁 ${e.name} finished P${e.place}`, "gold");
          break;
        case "start":
          this.hud.toast("🚦 Live race — GO!", "gold");
          break;
      }
    }
    if (this.state === "playing" && this.massRace.active) {
      net.send(this.bird.x, this.bird.y, this.bird.rotation, Math.max(0, this.bird.x - this.startX));
    }
  }

  private sendEmote(text: string): void {
    if (this.roomMuted) {
      this.hud.toast("Emotes muted in this room", "info");
      return;
    }
    if (this.elapsed - this.lastEmoteAt < 1.2) return; // simple spam guard
    this.lastEmoteAt = this.elapsed;
    this.massRace.showEmote("you", text);
    this.net?.sendEmote(text);
    this.audio.chirp();
    this.bump();
  }

  /** Pulls the selected board page; keeps the last page visible while loading. */
  private async refreshBoard(force = false): Promise<void> {
    if (this.boardLoading) return;
    if (!force) {
      const cached = this.board.peek(this.boardScope, this.boardMetric);
      if (cached) {
        this.boardPage = cached;
        this.bump();
      }
    }
    this.boardLoading = true;
    this.bump();
    try {
      this.boardPage = await this.board.fetch(this.boardScope, this.boardMetric);
    } finally {
      this.boardLoading = false;
      this.bump();
    }
  }

  /** Tournament prizes are granted through the same APIs the shop uses. */
  /**
   * Achievement/tournament prize skins: each `prizeOnly` label in Economy.ts
   * has a matching trigger here, so no earnable skin is ever a dead promise.
   */
  private checkPrizeSkins(): void {
    const st = this.save.state;
    const grant = (id: string, msg: string): void => {
      if (st.ownedSkins.includes(id)) return;
      this.save.ownSkin(id);
      this.hud.toast(`🐦 ${msg}`, "gold");
      this.audio.fanfare();
    };
    if (st.lifetime.ghostBeats >= 10) grant("ghost", "Ghost unlocked — 10 ghost wins!");
    if (st.lifetime.zeniths >= 25) grant("shadow", "Shadow unlocked — 25 zeniths banked!");
    if (st.duel.bestStreak >= 10) grant("mythic", "Mythic unlocked — 10-duel win streak!");
    if (st.ownedSkins.length >= 16) grant("rainbow", "Rainbow unlocked — 15-skin collection!");
    const tiers = this.cups.claimedTiers();
    if (tiers.includes("gold") || tiers.includes("diamond")) grant("champion", "Champion unlocked — gold cup claimed!");
    if (tiers.includes("diamond")) grant("legendary", "Legendary unlocked — diamond cup claimed!");

    // Collection completion bonuses: finishing a themed set pays real coins,
    // once per collection. The shop header shows progress toward each.
    for (const c of COLLECTIONS) {
      if (st.claimedCollections.includes(c.id)) continue;
      const members = SKINS.filter((k) => (k.collection ?? "starter") === c.id);
      if (members.length < 2) continue; // starter isn't a chase
      if (!members.every((k) => st.ownedSkins.includes(k.id))) continue;
      st.claimedCollections.push(c.id);
      const bonus = 100 + members.length * 25;
      this.save.addCoins(bonus);
      this.save.persist();
      this.hud.toast(`${c.icon} ${c.name} collection complete · +${bonus} coins`, "gold");
      this.audio.fanfare();
    }
  }

  private applyPrize(grant: PrizeGrant): void {
    const p = grant.prize;
    if (p.kind === "coins") this.save.addCoins(p.amount);
    else if (p.kind === "skin") this.save.ownSkin(p.id);
    else if (p.kind === "boost") this.save.armBoost(p.id);
    // trails/titles were already recorded inside Tournaments.claim()
    this.save.persist();
    this.lastPrize = grant;
    this.audio.purchase();
    this.particles.emitConfetti(this.bird.x, this.bird.y + 3);
    this.hud.toast(`${p.icon} ${p.label} — ${grant.tier} in ${grant.cup}`, "gold");
    this.telemetry.track("cup_prize", { tier: grant.tier, kind: p.kind, id: p.id });
    this.checkPrizeSkins();
    this.bump();
  }

  /** A portal-controlled commercial break at the natural death/restart seam. */
  private async restartWithPortalBreak(): Promise<void> {
    const platform = this.platform;
    if (!platform || platform.name === "none") {
      this.startRun();
      return;
    }
    this.setState("ad");
    this.telemetry.track("portal_break_request", { portal: platform.name, placement: "restart" });
    await platform.commercialBreak();
    if (this.disposed) return;
    this.endPortalAd();
    this.startRun();
  }

  /** Rewarded continue never succeeds unless the platform explicitly grants it. */
  private async continueWithPortalReward(): Promise<void> {
    const platform = this.platform;
    if (!platform || platform.name === "none") return;
    this.setState("ad");
    this.telemetry.track("portal_break_request", { portal: platform.name, placement: "continue" });
    const earned = await platform.rewardedBreak();
    if (this.disposed) return;
    this.endPortalAd();
    if (earned) {
      this.doContinue("portal_rewarded");
    } else {
      this.setState("continue");
      this.hud.toast("No reward this time — try coins or rest", "warn");
    }
  }

  private setState(s: GameState): void {
    const previous = this.state;
    this.state = s;
    this.acc = 0;
    this.last = performance.now();
    this.menuHold = 0;
    this.needRelease = true;
    if (s !== "playing") {
      this.timeScale = 1;
      this.zenithTimer = 0;
    }
    if (s === "menu" || s === "ad") this.audio.setMusicMode("menu");
    else if (s === "gameover" || s === "continue") this.audio.setMusicMode("sleep");
    else if (s === "paused") this.audio.duckMusic(0.55, 3);
    else if (s === "playing") this.audio.setMusicMode(this.feverOn ? "fever" : this.stormfront ? "storm" : "play");
    if (previous === "playing" && s !== "playing") this.platform?.gameplayStop();
    if (previous !== "playing" && s === "playing") this.platform?.gameplayStart();
    this.bump();
  }

  private atlas(): import("./HUD").AtlasEntry[] {
    const far = Math.max(this.save.state.farthestIsland, this.island);
    const count = Math.max(BIOMES.length * 2, far + 3);
    const out: import("./HUD").AtlasEntry[] = [];
    for (let i = 0; i < count; i++) {
      const b = biomeForIsland(i);
      const seen = this.save.state.biomesSeen.includes(b.id);
      out.push({
        island: i,
        name: b.name,
        emoji: b.emoji,
        tagline: b.tagline,
        color: `#${b.top.toString(16).padStart(6, "0")}`,
        reached: i <= far && seen,
        hazard: b.hazard,
      });
    }
    return out;
  }

  private setScreen(s: UiScreen): void {
    if (s !== this.screen) this.audio.uiTick();
    this.screen = s;
    this.menuHold = 0;
    this.needRelease = true;
    // Every return to the home screen refreshes the embedded leaderboard so a
    // just-finished run shows up immediately (cache-first, non-blocking).
    if (s === "main") void this.refreshBoard();
    this.bump();
  }

  private bump(): void {
    this.uiVersion += 1;
  }

  /** Public-facing pilot identity: VIPs wear the crown in every roster. */
  private racedName(): string {
    return this.save.isVipActive() ? `♛ ${this.pilotName}`.slice(0, 16) : this.pilotName;
  }

  /** Copies the room invite link, preferring the native share sheet. */
  private copyRoomInvite(code: string): void {
    const url = buildRoomInviteUrl(code);
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    const text = `Join my Sunbird race room ${code}: ${url}`;
    if (nav.share) {
      void nav
        .share({ title: "Sunbird race room", text, url })
        .then(() => this.hud.toast(`Invite shared for room ${code}`, "gold"))
        .catch(() => {
          void navigator.clipboard?.writeText(url).catch(() => undefined);
          this.hud.toast(`Invite link copied — room ${code}`, "gold");
        });
      return;
    }
    void navigator.clipboard?.writeText(url).catch(() => undefined);
    this.hud.toast(`Invite link copied — send it to friends`, "gold");
  }

  private lastRunDistance(): number {
    return Math.max(0, this.bird.x - this.startX);
  }

  private runStats(): RunStats {
    return {
      clouds: this.runClouds,
      island: this.island + 1,
      coins: this.runCoins,
      perfects: this.perfects,
      distance: Math.max(0, this.bird.x - this.startX),
      fever: this.feverReached ? 1 : 0,
      zenith: this.zeniths,
      pickups: this.pickups,
    };
  }

  /** 0..1 — continuous musical intensity from the moment-to-moment flight. */
  private musicIntensity(): number {
    if (this.state !== "playing") return 0;
    const speed = Math.min(1, this.bird.speed() / 90);
    const alt = Math.min(1, this.bird.altitude / ALT_HIGH);
    const fever = this.feverOn ? 1 : 0;
    const danger = 1 - Math.max(0, Math.min(1, this.daylight / this.daylightMax()));
    const chain = Math.min(1, this.ringChain / 4);
    return Math.min(1, speed * 0.35 + alt * 0.22 + fever * 0.3 + danger * 0.12 + chain * 0.12);
  }

  private score(): number {
    return (this.scoreAccum + this.bonus) * this.save.nestMultiplier();
  }

  private seedLabel(): string {
    if (this.seed.startsWith("fly-")) return `Fresh hills · ${this.seed.slice(4).toUpperCase()}`;
    if (this.seedMode === "yesterday") return `Yesterday's hills · ${formatDatePretty(this.seed)}`;
    if (this.seedMode === "random") return `Wild hills · ${this.seed.replace("wild-", "").toUpperCase()}`;
    return `Hills of ${formatDatePretty(this.seed)}`;
  }

  private dailyCard(): DailyCard {
    const c = dailyChallenge(this.today);
    const mode = modeById(c.mode);
    return {
      title: c.title,
      modeName: mode.name,
      modeIcon: mode.icon,
      modifierIcon: c.modifier.icon,
      modifierLabel: c.modifier.label,
      modifierDesc: c.modifier.desc,
      metric: c.metric,
      target: c.target,
      reward: c.reward,
      done: this.save.isDailyDone(this.today),
      dailiesDone: this.save.state.challenges.dailiesDone,
    };
  }

  private gauntletCard(): GauntletCard {
    const g = weeklyGauntlet(weekKey());
    const done = this.save.gauntletDone(g.week);
    return {
      week: g.week,
      stages: g.stages.map((st) => {
        const mode = modeById(st.mode);
        return {
          index: st.index,
          label: st.label,
          modeName: mode.name,
          modeIcon: mode.icon,
          metric: st.metric,
          target: st.target,
          reward: st.reward,
          done: done.includes(st.index),
        };
      }),
      clearBonus: g.clearBonus,
      cleared: done.length >= 3,
      lifetimeClears: this.save.state.challenges.gauntletsCleared,
    };
  }

  private calendarCard(): CalendarCard {
    const cal = this.save.state.calendar;
    const claimedToday = cal.lastClaim === this.today;
    const days = [];
    for (let d = 1; d <= CALENDAR_DAYS; d++) {
      days.push({
        day: d,
        label: calendarRewardLabel(d),
        claimed: d <= cal.cycleDay,
        today: !claimedToday && d === (cal.cycleDay % CALENDAR_DAYS) + 1,
        milestone: d % 7 === 0,
      });
    }
    return { cycleDay: cal.cycleDay, claimedToday, days };
  }

  private rivalCard(): RivalCard {
    const r = this.save.state.rival;
    const div = divisionFor(r.rating);
    const next = nextDivision(r.rating);
    const span = div.max - div.min;
    return {
      rating: Math.floor(r.rating),
      division: div.name,
      divisionIcon: div.icon,
      wins: r.wins,
      losses: r.losses,
      streak: r.streak,
      bestStreak: r.bestStreak,
      nextName: next ? next.div.name : "",
      nextNeeded: next ? next.needed : 0,
      progress: span > 0 ? Math.max(0, Math.min(1, (r.rating - div.min) / span)) : 1,
      matches: r.matches.map((m) => ({ place: m.place, field: m.field, mode: m.mode, date: m.date, won: m.won })),
      season: this.seasonCard(),
    };
  }

  /** Ranked-season summary: countdown, peak, and the payout it locks in. */
  private seasonCard(): RivalCard["season"] {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const daysLeft = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 86_400_000));
    const peak = this.save.state.rankSeason.peak;
    const reward = seasonReward(peak);
    return {
      daysLeft,
      peak: Math.floor(peak),
      peakDivision: reward.division.name,
      peakIcon: reward.division.icon,
      rewardCoins: reward.coins,
    };
  }

  private loadoutView(): LoadoutView {
    const trail = this.save.state.activeTrail
      ? (TRAILS[this.save.state.activeTrail]?.label ?? this.save.state.activeTrail)
      : "Default trail";
    return {
      bird: this.skin.name,
      trail,
      boosts: this.save.state.armedBoosts.length,
    };
  }

  private ghostDelta(): number | null {
    if (!this.ghostPlayer.active) return null;
    const dist = Math.max(0, this.bird.x - this.startX);
    const t = Math.min(this.runTime, 99999);
    const gx = this.ghostPlayer.update(t, 0);
    if (gx === null) return dist - this.ghostPlayer.bestDistance();
    return this.bird.x - gx;
  }

  /** Challenge/calendar/mastery cards, rebuilt only when the UI version bumps. */
  private cardCache: { daily: DailyCard; gauntlet: GauntletCard; calendar: CalendarCard; mastery: ReturnType<typeof masteryViews> } = {
    daily: { title: "", modeName: "", modeIcon: "", modifierIcon: "", modifierLabel: "", modifierDesc: "", metric: "", target: 0, reward: 0, done: false, dailiesDone: 0 },
    gauntlet: { week: "", stages: [], clearBonus: 0, cleared: false, lifetimeClears: 0 },
    calendar: { cycleDay: 0, claimedToday: false, days: [] },
    mastery: [],
  };

  private refreshViews(): void {
    const st = this.save.state;
    this.cardCache = {
      daily: this.dailyCard(),
      gauntlet: this.gauntletCard(),
      calendar: this.calendarCard(),
      mastery: masteryViews(this.save),
    };
    const stats = this.state === "menu" ? null : this.runStats();
    this.missionViews = this.missions.view(stats);
    this.questViews = this.missions.questView(this.today, stats);
    this.skinViews = SKINS.map((def) => ({
      def,
      owned: st.ownedSkins.includes(def.id),
      equipped: st.activeSkin === def.id,
      locked: (Boolean(def.goldOnly) && !st.gold) || (Boolean(def.vipOnly) && !st.vip),
      lockReason: def.vipOnly && !this.save.isVipActive() ? "vip" : def.goldOnly && !st.gold ? "gold" : null,
      affordable: st.wallet >= def.price,
    }));
    const deal = dailyDealBoost(this.today);
    this.boostViews = BOOSTS.map((def) => {
      const dealPrice = def.id === deal.id ? deal.price : undefined;
      return { def, armed: st.armedBoosts.includes(def.id), affordable: st.wallet >= (dealPrice ?? def.price), dealPrice };
    });
    this.shopTrailViews = SHOP_TRAILS.map((def) => ({
      def,
      owned: st.tournaments.trails.includes(def.id),
      equipped: st.activeTrail === def.id,
      affordable: st.wallet >= def.price,
    }));
    this.viewsVersion = this.uiVersion;
  }

  private pushHud(): void {
    if (this.viewsVersion !== this.uiVersion) this.refreshViews();
    const st = this.save.state;
    const stats = this.runStats();
    let todayBest = 0;
    for (const h of st.highScores) if (h.date === this.today && h.distance > todayBest) todayBest = h.distance;
    const sTier = this.seasonPass.tier();
    const sProg = this.seasonPass.progressInTier();
    const snap: HudSnapshot = {
      state: this.state,
      screen: this.screen,
      checkoutSku: this.checkoutSku,
      portalName: this.platform?.name ?? portalTarget(),
      version: this.uiVersion,
      distance: stats.distance,
      coins: this.runCoins,
      daylight: this.daylight,
      daylightMax: this.daylightMax(),
      fever: this.feverOn ? this.feverTimer / (FEVER_DURATION + this.skin.feverBonus + this.masteryPerk.feverBonus) : this.perfectChain / FEVER_NEED,
      feverOn: this.feverOn,
      multiplier: this.save.nestMultiplier() * (this.feverOn ? 2 : 1),
      bestDistance: st.bestDistance,
      score: this.score(),
      island: this.island,
      perfects: this.perfects,
      clouds: this.runClouds,
      zeniths: this.zeniths,
      rings: this.runRings,
      balloons: this.runBalloons,
      sunflowers: this.runSunflowers,
      hint: this.state === "playing" ? this.coachHint() || this.hint : "",
      magnetTimer: this.magnetTimer,
      shield: this.shield,
      boostTimer: this.boostTimer,
      gold: st.gold,
      vip: this.save.isVipActive(),
      vipDaysLeft: this.save.vipDaysLeft(),
      vipExpiredNotice: this.vipExpiredNotice,
      adsLeftToday: this.save.adsLeftToday(),
      ghostDelta: this.state === "playing" || this.state === "gameover" ? this.ghostDelta() : null,
      newBest: this.newBest,
      continueTimer: this.continueTimer,
      continueCost: CONTINUE_COST,
      canAffordContinue: st.wallet >= CONTINUE_COST,
      adAvailable: this.portalEnabled() ? Boolean(this.platform && this.platform.name !== "none") : this.ads.isAvailable(),
      adTimer: this.adTimer,
      adTotal: this.ads.duration,
      adReason: this.adReason,
      seedLabel: this.seedLabel(),
      rivalBanner: this.rival && this.rivalResult === "" ? `${this.rival.name}|${this.rival.distance}` : "",
      seedMode: this.seedMode,
      wallet: st.wallet,
      streakDays: st.streak.days,
      nestLevel: st.nestLevel,
      nestMult: this.save.nestMultiplier(),
      nestPrice: this.save.nestUpgradePrice(),
      nestMaxed: this.save.state.nestBought >= 10,
      missions: this.missionViews,
      quests: this.questViews,
      highScores: st.highScores,
      todayBest,
      runsPlayed: st.runsPlayed,
      newlyCompleted: this.newlyCompleted,
      claimedQuests: this.claimedQuests,
      skins: this.skinViews,
      boosts: this.boostViews,
      shopTrails: this.shopTrailViews,
      settings: st.settings,
      goldPrice: GOLD.price,
      starterPrice: STARTER_PACK.price,
      starterFeatures: STARTER_PACK.features,
      starterOwned: this.save.state.starterPack,
      goldFeatures: GOLD.features,
      vipPrice: VIP.price,
      vipFeatures: VIP.features,
      checkoutMode: this.checkoutMode(),
      checkoutUrl: stripeLinkFor(this.checkoutSku, st.deviceId) ?? "",
      checkoutBusy: this.checkoutBusy,
      checkoutError: this.checkoutError,
      checkoutOk: this.checkoutOk,
      checkoutWaiting: this.checkoutWaiting,
      restoreMessage: this.restoreMessage,
      resetArmed: this.resetArmed,
      season: {
        tier: sTier,
        maxTier: this.seasonPass.view().length,
        have: sProg.have,
        need: sProg.need,
        label: seasonLabel(seasonId()),
        tiers: this.seasonPass.view(),
      },
      trophies: this.achievements.view(),
      trophyCounts: this.achievements.counts(),
      referralCode: st.referralCode,
      referralRedeemed: st.referralRedeemed,
      referralMessage: this.referralMessage,
      cloudCode: this.screen === "account" ? this.save.exportCode() : "",
      cloudMessage: this.cloudMessage,
      canInstall: Boolean(this.deferredInstall) && !this.portalEnabled(),
      shareBusy: this.shareBusy,
      combo: Math.max(this.perfectChain, this.versus && this.p1 ? this.p1.launch.combo : this.launch.combo),
      speedNorm: Math.min(1, this.bird.speed() / 100),
      gust: this.weather.gust,
      inThermal: this.weather.inThermal,
      biomeName: this.terrain.biomeAt(this.bird.x).name,
      biomeEmoji: this.terrain.biomeAt(this.bird.x).emoji,
      atlas: this.screen === "atlas" ? this.atlas() : [],
      farthestIsland: Math.max(st.farthestIsland, this.island),
      launchBanner: this.launchBannerText,
      launchBannerT: this.launchBannerT,
      launchRating: this.lastLaunch?.rating ?? "none",
      altitude: this.versus && this.p1 ? this.p1.bird.altitude : this.bird.altitude,
      altZone: this.altZone,
      maxAltitude: this.maxAltitude,
      powers: this.versus && this.p1 ? this.p1.powers.view() : this.powers.view(),
      modes: MODES,
      modeId: this.modeId,
      modeName: this.mode.name,
      modeIcon: this.mode.icon,
      countdown: this.countdown,
      versus: this.versus,
      versusWinner: this.versusWinner,
      p1Stats: this.p1 && this.versus ? this.p1.stats : null,
      p2Stats: this.p2 && this.versus ? this.p2.stats : null,
      raceFinish: RACE_FINISH,
      sessionGoals: this.goals.goals,
      goalPop: this.goalPopT > 0 ? this.goalPop : "",
      nearMiss: this.nearMiss.text,
      skillLabel: this.flow.label(),
      skill: this.flow.skill,
      bestAltitude: this.save.state.bestAltitude,
      bestCombo: this.save.state.bestCombo,
      runGems: this.runGems,
      pilotName: this.pilotName,
      board: this.boardPage,
      boardLoading: this.boardLoading,
      boardScope: this.boardScope,
      boardMetric: this.boardMetric,
      boardOnline: isLeaderboardOnline(),
      cups: this.cups.view(),
      trails: this.cups.ownedTrails().map((id) => ({
        id,
        label: TRAILS[id]?.label ?? id,
        equipped: st.activeTrail === id,
      })),
      lastPrize: this.lastPrize ? `${this.lastPrize.prize.icon} ${this.lastPrize.prize.label}` : "",
      standings:
        this.massRace.active && this.state === "playing"
          ? this.massRace.standings(this.bird.x, this.startX, this.pilotName, 6).rows
          : [],
      racePlace: this.racePlace,
      raceFinishM: this.mode.finish,
      raceField: this.raceField,
      raceFinishTime: this.raceFinishTime,
      massRace: this.modeId === "massrace",
      multiplayerLive: isMultiplayerConfigured(),
      roster:
        this.massRace.active && this.state === "playing"
          ? this.massRace.roster(this.bird.x, this.startX, this.mode.finish, this.pilotName)
          : [],
      roomCode: this.net?.info().code ?? this.roomCode,
      roomCount: this.net?.info().count ?? this.massRace.fieldSize + 1,
      roomCapacity: this.net?.info().capacity ?? MASS_RACE_FIELD,
      roomSize: this.roomSize,
      roomSkill: this.roomSkill,
      roomMuted: this.roomMuted,
      roomRivals: this.massRace.rivals.slice(0, 12).map((r) => ({ id: r.id, name: r.name, skill: Math.round(r.skill * 100), hue: Math.round(r.hue * 360) })),
      netState: this.net?.info().state ?? "offline",
      netError: this.net?.info().error ?? "",
      draft: this.massRace.draft,
      finishRemaining: this.finishRemaining,
      nemesis: this.nemesis,
      photoFinish: this.photoFinish,
      rival: this.rivalCard(),
      loadout: this.loadoutView(),
      lobbyRivals: (() => {
        // Real pilots seated in the room always outrank seeded flavor text.
        const live = (this.net?.roster() ?? [])
          .slice(0, 3)
          .map((p) => ({ name: p.name, tag: "in room · live" }));
        if (live.length) return live;
        // Next best: time-shifted doubles of real leaderboard players.
        const page = this.board.peek("global", "distance");
        const ghosts = (page?.entries ?? [])
          .filter((en) => !en.you && en.name)
          .slice(0, 3)
          .map((en) => ({ name: en.name, tag: `best ${Math.round(en.distance).toLocaleString()} m` }));
        if (ghosts.length) return ghosts;
        return featuredRivals(`${this.seed}:massrace`);
      })(),
      raceRated: this.rankedRace,
      raceVerified: this.serverPlaceApplied,
      ratingDelta: this.lastRatingDelta,
      ratingBonus: this.lastRatingBonus,
      duel: { ...st.duel },
      duelWas: this.duelResult,
      duelDelta: this.duelDelta,
      duelFoe: duelOpponent(`${this.seed}:${this.today}`, st.rival.rating),
      daily: this.cardCache.daily,
      gauntlet: this.cardCache.gauntlet,
      calendar: this.cardCache.calendar,
      mastery: this.cardCache.mastery,
      challengeOutcome: this.challengeOutcome,
      weeklyEvent: weeklyEvent(),
      monthlyTheme: monthlyTheme(),
      eventClearsWeek: st.events.week === weekKey() ? st.events.clearsThisWeek : 0,
      eventClearsMonth: st.events.month === monthKey() ? st.events.clearsThisMonth : 0,
      themeTrailClaimed: st.events.claimedTrailMonth === monthKey(),
      themeTrailNeed: THEME_TRAIL_CLEARS,
      campaign: campaignViews(this.save, st.campaignClaimed),
      campaignDone: campaignProgress(st.campaignClaimed).done,
      campaignTotal: campaignProgress(st.campaignClaimed).total,
      squad: this.squad?.state ?? emptySquadState(),
      squadNotice: this.squadNotice,
      showTutorialHand: this.state === "playing" && st.tutorialRuns < 2 && this.hintTimer < 2.6 && !this.input.diving,
    };
    this.hud.update(snap);
  }

  /* ------------------------------------------------------- versus (2P) */

  private startVersus(): void {
    this.versus = true;
    this.modeId = "race";
    this.mode = modeById("race");
    this.versusWinner = 0;
    this.resetRun(true);
    this.bird.root.visible = false;
    this.ghostPlayer.reset();

    if (!this.p1) this.p1 = new Racer(0, "P1", 0xff7a45, this.terrain, this.scene);
    if (!this.p2) this.p2 = new Racer(1, "P2", 0x4aa8f0, this.terrain, this.scene);
    this.p1.applySkin(this.skin);
    this.p2.applySkin(skinById(this.save.state.ownedSkins.includes("bluejay") ? "bluejay" : "sunbird"));
    this.p1.reset(this.terrain, 64);
    this.p2.reset(this.terrain, 64);
    this.p1.camera.setBaseFov(58);
    this.p2.camera.setBaseFov(58);

    this.countdown = 3.99;
    this.input.splitMode = "vertical";
    this.setState("playing");
    this.setScreen("main");
    void this.audio.resume();
    this.audio.setMusicMode("play");
    this.telemetry.track("versus_start", { seed: this.seed });
  }

  private versusTick(dt: number): void {
    const p1 = this.p1!;
    const p2 = this.p2!;
    const ev = {
      onLaunch: (r: LaunchResult, racer: Racer) => {
        if (r.rating === "perfect") {
          this.particles.burstRing(racer.bird.x, racer.bird.y, 0xffe08a);
          this.audio.perfect();
        } else if (r.rating === "great") {
          this.particles.burstRing(racer.bird.x, racer.bird.y, 0xc8f0ff);
        }
      },
      onLand: () => undefined,
      onCoin: (gem: boolean, x: number, y: number) => {
        this.audio.ding();
        this.particles.emitCollect(x, y);
        if (gem) this.particles.burstRing(x, y, 0x9ae8ff);
      },
      onCloud: (_k: CloudKind, x: number, y: number) => {
        this.audio.cloud();
        this.particles.burstRing(x, y, 0xffffff);
      },
      onPickup: (_k: string, x: number, y: number) => {
        this.audio.powerup();
        this.particles.emitCollect(x, y);
      },
      onSplash: () => this.audio.splash(),
    };
    p1.step(dt, this.input.diving, this.terrain, this.particles, ev);
    p2.step(dt, this.input.diving2, this.terrain, this.particles, ev);

    for (const r of [p1, p2]) {
      if (!r.finished && r.stats.distance >= RACE_FINISH) {
        r.finished = true;
        r.stats.finishedAt = r.runTime;
        if (this.versusWinner === 0) {
          this.versusWinner = r.index + 1;
          this.hud.toast(`${r.label} wins!`, "gold");
          this.audio.island();
          this.particles.emitConfetti(r.bird.x, r.bird.y + 4);
        }
      }
    }
    if (p1.finished && p2.finished) this.finishVersus();
    else if (this.versusWinner !== 0) {
      // Give the trailing bird a few seconds of glory, then wrap up.
      this.versusGrace -= dt;
      if (this.versusGrace <= 0) this.finishVersus();
    }
  }

  private finishVersus(): void {
    if (this.state === "gameover") return;
    const p1 = this.p1!;
    const p2 = this.p2!;
    if (this.versusWinner === 0) this.versusWinner = p1.stats.distance >= p2.stats.distance ? 1 : 2;
    this.input.splitMode = "off";
    this.telemetry.track("versus_end", { winner: this.versusWinner });
    this.setState("gameover");
  }

  private exitVersus(): void {
    this.versus = false;
    this.input.splitMode = "off";
    this.bird.root.visible = true;
    if (this.p1) this.p1.bird.root.visible = false;
    if (this.p2) this.p2.bird.root.visible = false;
  }

  private resize(): void {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.camera.resize(w / Math.max(1, h));
    this.camera.setBaseFov(50);
    this.fx.resize(w, h, this.dpr);
    if (this.p1 && this.p2) {
      const vertical = w / Math.max(1, h) >= 1.25;
      this.input.splitMode = this.versus ? (vertical ? "vertical" : "horizontal") : "off";
    }
  }
}
