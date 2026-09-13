import * as THREE from "three";
import { Achievements } from "./Achievements";
import { GameAudio } from "./Audio";
import { BIOMES, biomeForIsland } from "./Biomes";
import { Bird, type BirdStepOpts } from "./Bird";
import { CameraRig } from "./CameraRig";
import { PICKUP_STYLE, Collectibles, type CloudKind, type PickupKind } from "./Collectibles";
import { evaluateNearMiss, FlowTuner, SessionGoals, type NearMiss } from "./Engagement";
import { LaunchSystem, ratingLabel, type LaunchResult } from "./LaunchSystem";
import { MODES, modeById, RACE_FINISH, type ModeDef, type ModeId } from "./Modes";
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
  MULTIPLAYER_WS_URL,
  ZENITH_ALT,
  ZENITH_DURATION,
  ZENITH_SLOWMO,
} from "./constants";
import { BOOSTS, GOLD, PROMO_CODES, SKINS, VIP, skinById, type BoostView, type SkinDef, type SkinView } from "./Economy";
import { GhostPlayer, GhostRecorder } from "./Ghost";
import { fetchRivalGhost, publishGhost } from "./GhostNet";
import { nextWings, wingsFor, wingsProgress, wingsPromotion } from "./Career";
import { HUD, type CheckoutMode, type HudSnapshot, type SeedMode, type UiScreen, type UiState } from "./HUD";
import { Input } from "./Input";
import { clamp, dateSeed, formatDatePretty, lerp } from "./math";
import { VoiceControl, type VoiceCommand } from "./VoiceControl";
import { Missions, type MissionView, type QuestReward, type QuestView, type RunStats } from "./Missions";
import { ParticleFX } from "./ParticleFX";
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
import type { PlatformAdapter } from "../sdk/platform";
import { SaveData } from "./SaveData";
import { SeasonPass, seasonId, seasonLabel, XP_RULES } from "./SeasonPass";
import { buildShareCard, shareOrDownload } from "./Social";
import { ChallengeSystem, type ChallengeData } from "./ChallengeSystem";
import { Sky } from "./Sky";
import { Telemetry } from "./Telemetry";
import { TerrainEffects } from "./TerrainEffects";
import { TerrainSystem } from "./TerrainSystem";
import { Weather } from "./Weather";
import { PostProcessing } from "./PostProcessing";
import { GodRays } from "./GodRays";
import { SpeedLines } from "./SpeedLines";
import { Leaderboard } from "./Leaderboard";
import { GlobalLeaderboard, type GlobalEntry } from "./GlobalLeaderboard";
import { GameJuice } from "./GameJuice";
import { Multiplayer } from "./Multiplayer";
import { OnlineMultiplayer, type RoomPlayer } from "./OnlineMultiplayer";
import { Notifications } from "./Notifications";
import { DailyChallenge, type DailyChallengeResult } from "./DailyChallenge";
import { WeeklyTournament, type WeeklyTournamentResult } from "./WeeklyTournament";
import { TTS } from "./TTS";
import { AdManager } from "./AdManager";
import { initLang, type Lang } from "./i18n";
import { PerformanceDashboard } from "./PerformanceDashboard";
import { KeyboardNavigation } from "./KeyboardNavigation";
import { TouchFeedback } from "./TouchFeedback";
import { EnhancedTutorial } from "./EnhancedTutorial";
import { NameInput } from "./NameInput";
import { PetCompanion, PET_CONFIGS, type PetConfig } from "./PetCompanion";
import { MultiplayerColors } from "./MultiplayerColors";

export type GameState = UiState;
type AdReason = "continue" | "interstitial";

const _hslTemp = new THREE.Color();
function hsl(h: number, s: number, l: number): [number, number, number] {
  _hslTemp.setHSL(h, s, l);
  return [_hslTemp.r, _hslTemp.g, _hslTemp.b];
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
  private readonly sky: Sky;
  private readonly mockPayments = new MockPaymentProvider();
  private readonly ads: AdProvider = new MockAdProvider();
  private platform: PlatformAdapter | null = null;
  private readonly telemetry = new Telemetry();
  private readonly voice = new VoiceControl();
  private readonly ghostRecorder = new GhostRecorder();
  private readonly ghostPlayer = new GhostPlayer();
  /** Network rival ghost (async PvP on the daily seed) — amber silhouette. */
  private readonly rivalGhostPlayer = new GhostPlayer();
  private rivalGhostName = "";
  private rivalGhostPassed = false;
  /** Run counter — guards async ghost loads against arriving mid-next-run. */
  private runEpoch = 0;
  /** Weekly-event physics mods, cached at run start (hot path: every frame + every coin). */
  private weeklyMods = { coinMult: 1, gravityMult: 1, windMult: 1, daylightMult: 1 };
  /** Flight recap: downsampled [x, y] profile of the finished run. */
  private flightPath: [number, number][] = [];
  /** First thermal of the run gets a toast; the HUD chip covers the rest. */
  private thermalToasted = false;
  private terrain: TerrainSystem;
  private postFX: PostProcessing;
  private godRays: GodRays;
  private terrainFx: TerrainEffects;
  private speedLines: SpeedLines;
  private juice: GameJuice;
  private leaderboard: Leaderboard;
  private globalLb = new GlobalLeaderboard();
  private globalLbRank = 0;
  private globalLbTotal = 0;
  private globalLbTop: GlobalEntry[] = [];
  private mp: Multiplayer | null = null;
  private onlineMp: OnlineMultiplayer | null = null;
  private adMgr: AdManager = new AdManager();
  private mpState: "idle" | "connecting" | "lobby" | "racing" | "results" = "idle";
  private mpChat: { from: string; msg: string }[] = [];
  private mpPlayers: { name: string; color: number; ready: boolean; distance: number; alive: boolean; rank: number }[] = [];
  private readonly notif = new Notifications();
  private readonly tts = new TTS();
  private readonly perfDashboard: PerformanceDashboard;
  private readonly keyboardNav: KeyboardNavigation;
  private readonly touchFeedback: TouchFeedback;
  private readonly enhancedTutorial: EnhancedTutorial;
  private readonly nameInput: NameInput;
  private readonly multiplayerColors: MultiplayerColors;
  private petCompanion: PetCompanion | null = null;
  private activePet: PetConfig | null = null;
  private collect: Collectibles;
  private weather: Weather;
  private today = dateSeed();
  private seed: string;
  private seedMode: SeedMode = "today";

  private state: GameState = "menu";
  private screen: UiScreen = "main";
  private uiVersion = 0;
  private viewsVersion = -1;
  private hudVersion = -1;
  private missionViews: MissionView[] = [];
  private questViews: QuestView[] = [];
  private skinViews: SkinView[] = [];
  private boostViews: BoostView[] = [];

  private raf = 0;
  private acc = 0;
  private last = 0;
  private elapsed = 0;
  private menuBirdT = 0; // accumulated time for ambient menu-screen bird flight
  private stuckTimer = 0; // seconds the bird hasn't advanced (auto give-up detection)
  private lastStuckX = 0; // x position sampled for stuck detection
  private runTime = 0;
  private disposed = false;
  private hidden = false;
  private timeScale = 1;
  private zenithTimer = 0;
  private _hudBiome!: ReturnType<TerrainSystem["biomeAt"]>;
  private frameEma = 1 / 60;
  private qualityTimer = 0;
  private dpr = 1;
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
  private nearMissActive = false;
  private hintTimer = 0;
  private hint = "";
  private runCoins = 0;
  private runClouds = 0;
  private zeniths = 0;
  private pickups = 0;
  private magnetTimer = 0;
  private shield = 0;
  private boostTimer = 0;
  private continueUsed = false;
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
  private readonly flow = new FlowTuner();
  private readonly goals: SessionGoals;
  private nearMiss: NearMiss = { kind: "none", gap: 0, text: "" };
  private goalPop = "";
  private goalPopT = 0;
  private recordBanner = "";
  private runGems = 0;
  private readonly powers = new PowerUps();
  private mode: ModeDef = modeById("daytrip");
  private modeId: ModeId = "daytrip";
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
  private activeChallenge: ChallengeData | null = null;
  private resetArmed = false;
  private resetTimer = 0;
  private giveUpArmed = false;

  /* --- rewarded ad session state --- */
  private adSessionCount = 0;
  private readonly AD_SESSION_CAP = 7;
  private doubleCoinsEarned = false;
  private doubleCoinsUsed = false;
  private skinTrialActive = false;
  private bonusQuestEarned = false;
  private headstartAdUsed = false;
  private gemMultActive = false;
  private gemMultAvailable = false;
  private shieldRefillUsed = false;
  private shieldRefillCooldown = 0;
  private streakSaveUsed = false;
  private pendingBonusQuestLabel = "Ad quest: Fly 1000m";

  /* --- daily challenge / weekly tournament results --- */
  private dailyResult: DailyChallengeResult | null = null;
  private weeklyResult: WeeklyTournamentResult | null = null;

  private readonly resizeObs: ResizeObserver;
  private readonly onVis: () => void;
  private readonly onResize: () => void;
  private readonly onAdOpen: () => void = () => {};
  private readonly onAdClose: () => void = () => {};
  private readonly loop: (t: number) => void;

  constructor(private readonly host: HTMLElement, platform?: PlatformAdapter | null) {
    this.save = new SaveData();
    this.flow.load(this.save);
    this.goals = new SessionGoals(this.flow);
    this.missions = new Missions(this.save);
    this.achievements = new Achievements(this.save);
    this.seasonPass = new SeasonPass(this.save);
    this.seed = this.today;

    host.classList.add("game-root");
    const canvas = document.createElement("canvas");
    canvas.className = "game-canvas";
    host.appendChild(canvas);

    // Skip AA on retina/high-DPI — pixel density provides free AA (saves ~2ms)
    const isRetina = (window.devicePixelRatio || 1) >= 2;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !isRetina,
      powerPreference: "default", // "high-performance" crashes integrated GPUs on some machines
      failIfMajorPerformanceCaveat: false,
    });
    this.renderer.setClearColor(0x87c8ee, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // No tone mapping on renderer — OutputPass in EffectComposer handles it.
    // ACESFilmicToneMapping here would double-apply and wash out colours.
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    // Shadows only enabled when quality allows — expensive on mobile GPUs
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.dpr = this.preferredDpr();
    this.renderer.setPixelRatio(this.dpr);

    this.scene = new THREE.Scene();
    // Fog pushed well past the action: at near=40 the hills the bird is about
    // to fly through were already washed out, which read as permanent mist.
    this.scene.fog = new THREE.Fog(0xd6f0ff, 260, 1250);

    this.hud = new HUD(host);
    this.input = new Input(host, () => {
      void this.audio.resume();
    });
    this.audio = new GameAudio();

    // Voice control
    this.voice.init();
    this.voice.onVoiceCommand((cmd) => this.handleVoiceCommand(cmd));
    if (this.save.state.settings.voiceEnabled) this.voice.start();

    this.terrain = new TerrainSystem(this.seed);
    this.scene.add(this.terrain.group);

    this.bird = new Bird();
    this.bird.addTo(this.scene);
    this.ghostPlayer.addTo(this.scene);
    this.rivalGhostPlayer.addTo(this.scene);
    this.rivalGhostPlayer.setTint(0xffc86a, 0xffe8b0);

    this.camera = new CameraRig(1);
    this.particles = new ParticleFX();
    this.particles.addTo(this.scene);
    this.sky = new Sky();
    this.scene.add(this.sky.group);
    this.sky.addLights(this.scene);

    this.collect = new Collectibles(this.terrain.seedN);
    this.scene.add(this.collect.group);
    this.weather = new Weather(this.terrain.seedN);
    this.weather.addTo(this.scene);

    // Post-processing pipeline — bloom, color grading, FXAA
    this.postFX = new PostProcessing(this.renderer, this.scene, this.camera.camera);

    // God rays from sun
    this.godRays = new GodRays();
    this.scene.add(this.godRays.group);

    // Terrain visual effects (foam, sparkles, heat haze)
    this.terrainFx = new TerrainEffects();
    this.scene.add(this.terrainFx.group);

    // Speed lines effect
    this.speedLines = new SpeedLines();
    this.scene.add(this.speedLines.points);

    // Game juice effects
    this.juice = new GameJuice();
    this.scene.add(this.juice.comboPulseMesh);
    this.scene.add(this.juice.zenithRingMesh);
    this.scene.add(this.juice.launchBurstPoints);
    this.juice.attachToCamera(this.camera.camera);

    // Leaderboard
    this.leaderboard = new Leaderboard();

    // Performance dashboard
    this.perfDashboard = new PerformanceDashboard(this.telemetry);

    // Keyboard navigation
    this.keyboardNav = new KeyboardNavigation();
    this.keyboardNav.enable();

    // Touch feedback
    this.touchFeedback = new TouchFeedback();

    // Enhanced tutorial
    this.enhancedTutorial = new EnhancedTutorial(this.save.state.settings.lang);
    // Restore saved name into tutorial
    if (this.save.state.playerName) {
      this.enhancedTutorial.setName(this.save.state.playerName);
    }

    // Name input
    this.nameInput = new NameInput();
    this.nameInput.create({
      onSubmit: (name) => {
        this.enhancedTutorial.setName(name);
        this.save.state.playerName = name;
        this.save.persist();
        this.hud.toast(`Welcome, ${name}! 🐦`, "gold");
      },
    });

    // Multiplayer colors
    this.multiplayerColors = new MultiplayerColors();

    // Show name input if no name set
    if (!this.save.state.playerName && this.save.state.runsPlayed === 0) {
      setTimeout(() => this.nameInput.open(), 2000);
    }

    // Initialize pet companion
    this.petCompanion = new PetCompanion();
    this.petCompanion.addTo(this.scene);
    
    // Load equipped pet if any
    this.loadEquippedPet();

    this.applySkin();
    this.applySettings();
    this.resetRun(true);
    this.camera.setIntro(1);
    this.audio.setMusicMode("menu");

    this.onFocus = () => {
      if (this.checkoutWaiting && this.screen === "checkout") {
        this.telemetry.track("stripe_return_focus", { sku: this.checkoutSku });
        this.hud.toast("Welcome back — confirm below if you finished paying", "info");
      }
    };
    window.addEventListener("focus", this.onFocus);

    // Mute audio + disable input during platform ad breaks (Poki + CrazyGames require this)
    this.onAdOpen = () => {
      this.audio.setMuted(true);
      // Disable all input during ads to prevent accidental interactions
      this.input.held = false;
      this.input.pausePressed = false;
      this.input.restartPressed = false;
    };
    this.onAdClose = () => {
      this.audio.setMuted(false);
    };
    document.addEventListener("sunbird-ad-open", this.onAdOpen);
    document.addEventListener("sunbird-ad-close", this.onAdClose);

    this.hud.onAction((action, id) => this.handleAction(action, id));

    // MutationObserver to inject TTS/voice buttons into settings
    const injectTTS = () => {
      const card = document.querySelector('.paper-card');
      if (card && card.innerHTML.includes('Settings') && !card.querySelector('[data-action="set-tts"]')) {
        const html = card.innerHTML;
        const notifIdx = html.indexOf('Notifications');
        if (notifIdx > 0) {
          const before = html.substring(0, notifIdx);
          const after = html.substring(notifIdx);
          const voiceRow = `<div class="setting-row"><span>🎤 Voice control</span><button class="toggle ${this.voice.isEnabled() ? 'on' : ''}" data-ui data-action="set-voice" aria-pressed="${String(this.voice.isEnabled())}" aria-label="Voice control"><i></i></button></div>`;
          const ttsRow = `<div class="setting-row"><span>🔊 Voice feedback</span><button class="toggle ${this.tts.isEnabled() ? 'on' : ''}" data-ui data-action="set-tts" aria-pressed="${String(this.tts.isEnabled())}" aria-label="Voice feedback"><i></i></button></div>`;
          card.innerHTML = before + voiceRow + ttsRow + after;
        }
      }
    };
    new MutationObserver(injectTTS).observe(document.body, { childList: true, subtree: true });

    this.onResize = () => this.resize();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    window.addEventListener("resize", this.onResize);
    this.onVis = () => {
      if (document.hidden) {
        this.hidden = true;
        this.postFX.setBloomEnabled(false); // Stop post-processing in background tabs
        if (this.state === "playing") this.setState("paused");
      } else {
        this.hidden = false;
        this.postFX.setBloomEnabled(true);
        this.last = performance.now();
        this.acc = 0;
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
    ensureStripeJs();
    void this.notif.init();
    this.tts.init();
    if (this.save.state.settings.tts) this.tts.setEnabled(true);
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

    // Check for incoming challenge from URL hash
    const challenge = ChallengeSystem.parseChallenge();
    if (challenge) {
      this.activeChallenge = challenge;
      // Show challenge accepted toast after a short delay
      window.setTimeout(() => {
        if (this.disposed) return;
        this.hud.toast(`Challenge from ${challenge.from}: Beat ${challenge.score} pts!`, "gold");
        this.hud.toast(`Same hill: ${challenge.seed}`, "info");
        // Rebuild world with the challenge seed so the player plays the same hill
        this.rebuildWorld(challenge.seed);
      }, 1000);
    }

    this.telemetry.track("session_start", {
      gold: this.save.state.gold,
      vip: this.save.isVipActive(),
      runs: this.save.state.runsPlayed,
      streak: this.save.state.streak.days,
    });
    this.bump();
    this.pushHud();

    // Platform SDK adapter (Poki / CrazyGames / null in dev)
    if (platform) {
      this.platform = platform;
      // Signal loading complete — Poki measures conversion from this point
      platform.loadingFinished();
      // Wire up AdManager with platform
      this.adMgr.setPlatform(platform);
    }

    // Initialize i18n from saved language
    initLang(this.save.state.settings.lang as Lang | undefined);
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
    document.removeEventListener("sunbird-ad-open", this.onAdOpen);
    document.removeEventListener("sunbird-ad-close", this.onAdClose);
    this.telemetry.flush();
    this.telemetry.dispose();
    this.weather.dispose();
    this.voice.dispose();
    this.input.dispose();
    this.audio.dispose();
    this.tts.dispose();
    this.hud.dispose();
    this.perfDashboard.dispose();
    this.keyboardNav.dispose();
    this.touchFeedback.dispose();
    this.nameInput.dispose();
    this.petCompanion?.dispose();
    this.multiplayerColors.dispose();
    this.terrain.dispose();
    this.terrainFx.dispose();
    this.bird.dispose();
    this.particles.dispose();
    this.sky.dispose();
    this.collect.dispose();
    this.postFX.dispose();
    this.godRays.dispose();
    this.speedLines.dispose();
    this.juice.dispose();
    this.mp?.dispose(this.scene);
    this.onlineMp?.dispose();
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
    const raw = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.hidden) return;

    this.handleHotkeys();
    this.dayTick(raw);
    this.adaptQuality(raw);
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
  }

  private menuTick(dt: number): void {
    this.menuBirdT += dt;
    const t = this.menuBirdT;

    // Cinematic soaring oval — wide, high, dramatic. Period ~24 s.
    const loopPeriod = 24;
    const angle = (t / loopPeriod) * Math.PI * 2;

    const xRadius = 75;
    const baseX = this.startX + 12;
    const bx = baseX + Math.sin(angle) * xRadius;

    // High-altitude flight path — bird soars skyward for an epic first impression
    const groundY = this.terrain.heightAt(bx);
    const glideAlt = 70 + Math.sin(angle * 2 + 0.5) * 22; // 48..92 m up — truly soaring
    const targetY = groundY + glideAlt;

    // Analytically derived velocity (derivative of position), avoids division instability
    const dangle = (Math.PI * 2) / loopPeriod; // radians/s
    const vx = Math.cos(angle) * xRadius * dangle;
    const vy = Math.cos(angle * 2 + 0.5) * 22 * 2 * dangle; // d(glideAlt)/dt

    // Emit ambient thermals at the bird's altitude for a living sky
    if (Math.random() < 0.25) this.particles.emitThermal(bx, targetY - 8, 24);
    if (Math.random() < 0.12) this.particles.emitWind(bx, targetY, this.weather.gust + 0.4);

    // Lerp position so first frame doesn't teleport
    this.bird.x = bx;
    this.bird.y = t < 0.3 ? this.bird.y + (targetY - this.bird.y) * (t / 0.3) : targetY;
    this.bird.vx = vx;
    this.bird.vy = vy;
    this.bird.grounded = false;
    this.bird.inWater = false;
    this.bird.asleep = false; // show wings open while gliding on menu
    this.bird.rotation = Math.atan2(vy, Math.abs(vx) + 1) * 0.6;

    if (this.screen === "main") this.holdToStart(dt, 0.18);
  }

  private holdToStart(dt: number, threshold: number): void {
    if (this.input.diving) {
      if (this.needRelease) return;
      this.menuHold += dt;
      if (this.menuHold > threshold) this.startRun();
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
    // Shield refill: after cooldown, offer the ad when shield is 0
    if (this.shield <= 0 && !this.shieldRefillUsed && this.adSessionCount < this.AD_SESSION_CAP) {
      const prev = this.shieldRefillCooldown;
      this.shieldRefillCooldown += dt;
      if (prev <= 25 && this.shieldRefillCooldown > 25) {
        this.bump(); // trigger HUD update to show the banner (once at threshold)
      }
    } else {
      this.shieldRefillCooldown = 0;
    }
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
        speedMult: skin.speedMult,
        boost: this.boostTimer > 0 || this.powers.boostOn(),
        liftMult: this.powers.liftMult(),
        dragMult: this.powers.dragMult(),
        feather: this.powers.featherOn(),
      },
      this.terrain,
    );

    if (this.bird.justLaunched) {
      this.onLaunch();
      // Launch burst — particles in the launch direction
      const launchSlope = this.terrain.slopeAt(this.bird.x);
      const launchDirX = Math.cos(Math.atan(launchSlope));
      const launchDirY = Math.sin(Math.atan(launchSlope));
      this.juice.launchBurst(this.bird.x, this.bird.y, launchDirX, launchDirY);
    }
    if (this.bird.justLanded) this.onLanding();

    this.ghostRecorder.sample(dt, this.runTime, this.bird.x, this.bird.y, this.bird.rotation);
    if (this.rivalGhostPlayer.active) {
      const rx = this.rivalGhostPlayer.update(this.runTime, dt);
      if (rx !== null && !this.rivalGhostPassed && this.bird.x > rx + 0.5 && this.runTime > 4) {
        this.rivalGhostPassed = true;
        this.hud.toast(`👻 Passed ${this.rivalGhostName}'s flight!`, "gold");
        this.audio.ding();
        this.bonus += 60;
      }
    }
    if (this.ghostPlayer.active) {
      const gx = this.ghostPlayer.update(this.runTime, dt);
      if (gx !== null) {
        const ahead = this.bird.x > gx + 0.5;
        if (!ahead) this.ghostWasAhead = true;
        if (ahead && this.ghostWasAhead && !this.ghostPassed && this.runTime > 4) {
          this.ghostPassed = true;
          this.save.addGhostBeat();
          const newTrophies = this.achievements.checkNew();
          for (const t of newTrophies) {
            this.hud.toast(`Trophy: ${t.title}`, "gold");
            this.audio.trophy();
            this.audio.setMusicMode("celebrate");
            setTimeout(() => this.audio.setMusicMode(this.feverOn ? "fever" : "play"), 3000);
            this.postFX.pulseBloom(0.4, 1.8);
            this.juice.shake(0.6);
          }
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
        // Once per run: after the first call-out the ♨ HUD chip carries the
        // message — toasting every thermal doubled the same text on screen.
        if (!this.thermalToasted && this.hintTimer < 40) {
          this.thermalToasted = true;
          this.hud.toast("Thermal — release to ride it", "power");
        }
      },
      onGustStart: () => {
        this.audio.gust();
        this.audio.duckMusic(0.2, 0.8);
      },
      onStormHit: (x, y) => {
        this.audio.storm();
        this.particles.emitAsh(x, y);
        this.shake(0.6);
        this.haptic(20);
        this.hud.toast("Ash cloud!", "warn");
        this.perfectChain = 0;
        this.hud.updateBorderGlow(0);
      },
      onLightning: () => {
        this.flash("perfect");
        this.haptic(10);
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

    const biomeNow = this.terrain.biomeAt(this.bird.x);
    if (biomeNow.id !== this.lastBiomeId) {
      this.lastBiomeId = biomeNow.id;
      this.tts.announceIsland(biomeNow.name);
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
      this.haptic(20);
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
    if (this.feverOn || this.boostTimer > 0 || this.bird.speed() > 48 || ((skin.magnetAlways || skin.id === "aurora") && this.bird.speed() > 24)) {
      this.emitTrail();
    }
    // Wing air trails — always on while airborne, give the bird a living wake
    if (!this.bird.grounded) {
      this.particles.emitWingTrails(this.bird.x, this.bird.y, Math.max(8, this.bird.speed()));
    }
    // Feather trail — white feathers floating behind the bird (lower threshold for more life)
    if (!this.bird.grounded && this.bird.speed() > 12) {
      const banking = this.bird.vy * 0.015;
      this.particles.emitFeather(this.bird.x, this.bird.y, this.bird.speed(), banking);
    }
    // Wingtip vortices — spiral trails during banking at speed
    if (!this.bird.grounded && this.bird.speed() > 40) {
      const wingTips = this.bird.getWingTips();
      for (const tip of wingTips) {
        this.particles.emitWingtipVortex(tip.x, tip.y, tip.z, this.bird.speed(), this.bird.vy * 0.015);
      }
    }
    // Soaring glow motes — when high altitude, rising golden light rises around the bird
    if (!this.bird.grounded && this.bird.altitude > 18 && Math.random() < 0.4) {
      this.particles.emitSoarMote(this.bird.x, this.bird.y, this.bird.altitude);
    }
    // Speed shimmer — heat-shimmer effect at max speed
    if (this.bird.speed() > 70) {
      this.particles.emitSpeedShimmer(this.bird.x, this.bird.y, this.bird.speed());
    }

    this.splashCd -= dt;
    if (this.bird.inWater && this.splashCd <= 0) {
      this.splashCd = 0.55;
      this.particles.emitSplash(this.bird.x, WATER_Y);
      this.audio.splash();
      this.shake(0.45);
      // Survival mode: one life — hitting water ends the run immediately
      if (this.modeId === "survival") {
        this.finishRun();
        return;
      }
      this.daylight = Math.max(0, this.daylight - DAYLIGHT_OCEAN_PENALTY);
    }
    // Near-miss detection — blue flash when narrowly skimming over water
    if (!this.bird.inWater && !this.bird.grounded && this.terrain.isOcean(this.bird.x)) {
      const distToWater = this.bird.y - WATER_Y;
      if (distToWater > 0 && distToWater < 2.5 && this.bird.speed() > 30) {
        if (!this.nearMissActive) {
          this.nearMissActive = true;
          this.juice.nearMissFlash();
          this.juice.shake(0.2);
        }
      } else {
        this.nearMissActive = false;
      }
    } else {
      this.nearMissActive = false;
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
        this.shake(0.7);
        this.haptic(30);
        this.bonus += 80 * idx;
        this.awardXp(XP_RULES.island);
      } else {
        this.hud.toast(`Washed ashore on ${b.name}`, "warn");
      }
    }

    const magnetOn = this.feverOn || this.magnetTimer > 0 || skin.magnetAlways || this.powers.magnetOn();
    this.collect.update(dt, this.bird, this.terrain, magnetOn, this.elapsed, this.powers.magnetScale(), {
      onCoin: (x, y, gem) => {
        const base = gem ? 5 : 1;
        const gemMult = gem && this.gemMultActive ? 5 : 1;
        const value = base * gemMult * (this.save.state.gold ? 2 : 1) * this.powers.coinMult() * (this.mode.id === "coinrush" ? 2 : 1);
        this.runCoins += value;
        this.bonus += 4 * COIN_VALUE * value;
        this.awardXp(XP_RULES.coin);
        this.audio.ding();
        this.particles.emitCollect(x, y);
        this.particles.emitCollectTrail(x, y, this.bird.x, this.bird.y, gem ? 0x9ae8ff : 0xffd24a);
        // Juice: floating "+1" text that rises and fades
        this.hud.floatText(`+${value}`, x, y, gem ? "gold" : "info");
        // Juice: micro-shake on gem collection
        if (gem) this.shake(0.15);
        // Juice: coins counter bump
        this.hud.coinBump();
        if (gem) {
          this.runGems += 1;
          this.gemMultActive = false;
          this.gemMultAvailable = false;
          this.particles.burstRing(x, y, 0x9ae8ff);
          this.hud.toast(`Sky gem +${value}${gemMult > 1 ? " (5× bonus!)" : ""}`, "gold");
          this.bump();
        }
        this.haptic(8);
      },
      onCloud: (kind, x, y) => this.onCloud(kind, x, y),
      onPickup: (kind, x, y) => this.onPickup(kind, x, y),
    });

    if (this.feverOn) {
      this.feverTimer -= dt;
      // Boost bloom during fever for dramatic glow
      this.postFX.setBloomStrength(1.5);
      if (this.feverTimer <= 0) {
        this.feverOn = false;
        this.perfectChain = 0;
        this.hud.updateBorderGlow(0);
        this.audio.setMusicMode("play");
        this.postFX.setBloomStrength(0.7); // Return to baseline
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

    // Finish line (Race mode) — reached by distance, not by clock.
    if (this.mode.finish > 0 && !this.runRecorded && this.bird.x - this.startX >= this.mode.finish) {
      this.hud.toast("FINISH!", "gold");
      this.particles.emitConfetti(this.bird.x, this.bird.y + 4);
      this.audio.island();
      this.finishRun();
      return;
    }

    if (this.mode.clock > 0) {
      this.daylight -= dt;
      if (this.daylight <= 0 && !this.bird.asleep) {
        this.onDaylightOut();
        return;
      }
    }

    // Auto give-up: if the bird hasn't advanced 8 m in 5 s, treat as stuck
    if (!this.bird.asleep) {
      if (this.bird.x - this.lastStuckX > 8) {
        this.lastStuckX = this.bird.x;
        this.stuckTimer = 0;
      } else {
        this.stuckTimer += dt;
        if (this.stuckTimer > 5) {
          this.stuckTimer = 0;
          this.hud.toast("Stuck! Returning to menu…", "warn");
          this.goToMenu();
          return;
        }
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
      zeniths: this.zeniths,
      islands: this.island,
      fever: this.feverReached ? 1 : 0,
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

    // Online multiplayer position sync
    if (this.mpState === "racing" && this.onlineMp) {
      this.onlineMp.syncPosition(
        this.bird.x, this.bird.y,
        this.bird.vx, this.bird.vy,
        Math.max(0, this.bird.x - this.startX),
        !this.bird.asleep,
      );
    }
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

    if (res.rating === "perfect") {
      this.perfects += 1;
      this.perfectChain += 1;
      this.juice.comboPop(); // Gold border pulse on combo increase
      // Combo visual feedback: floating number + border glow + rising pitch
      this.hud.comboFloat(this.perfectChain);
      this.hud.updateBorderGlow(this.perfectChain);
      this.audio.comboRisingPitch(this.perfectChain);
      const pts = 60 + combo * 22;
      this.bonus += pts;
      this.hud.floatText(`+${pts}`, this.bird.x, this.bird.y, "gold");
      this.awardXp(XP_RULES.perfect);
      this.audio.perfect();
      if (combo >= 5) this.audio.wow();
      else this.audio.yip();
      this.audio.duckMusic(0.32, 0.35);
      this.particles.burstRing(this.bird.x, this.bird.y, 0xffe08a);
      this.postFX.pulseBloom(0.25, 2.2);
      this.juice.hitStop(0.05);
      this.juice.shake(0.5);
      for (let i = 0; i < 14 + combo * 5; i++) this.particles.emitSparkle(this.bird.x, this.bird.y);
      this.flash("perfect");
      this.shake(0.38 + Math.min(0.45, combo * 0.07));
      this.haptic(14);
      // A breath of slow-motion so the launch lands emotionally.
      if (!this.save.state.settings.reduceMotion) {
        this.timeScale = 0.45;
        this.zenithTimer = 0.16;
      }
      this.camera.punch(5 + combo);
      this.tts.announceCombo(this.perfectChain);
      if (this.perfectChain >= FEVER_NEED) this.enterFever();
    } else if (res.rating === "great") {
      this.bonus += 28;
      this.hud.floatText("+28", this.bird.x, this.bird.y, "info");
      this.awardXp(3);
      this.audio.butter();
      this.particles.burstRing(this.bird.x, this.bird.y, 0xc8f0ff);
      this.camera.punch(3);
      this.haptic(9);
    } else {
      this.bonus += 8;
      this.audio.chirp();
    }
  }

  /** Landings feed straight back into momentum, so they get feedback too. */
  private onLanding(): void {
    const q = this.bird.landingQuality;
    if (q >= LAND_PERFECT && this.bird.speed() > 30) {
      this.bonus += 12;
      this.audio.butter();
      this.hud.toast("Butter landing", "cloud");
      this.particles.burstRing(this.bird.x, this.bird.y, 0xffffff);
      this.postFX.pulseBloom(0.2, 1.3); // Subtle bloom on perfect landing
      this.juice.hitStop(0.05); // Satisfying freeze on butter landing
      this.juice.flash(0xffe08a, 0.15); // Golden flash
    } else if (q < 0.8) {
      this.launch.breakCombo();
      this.perfectChain = 0;
      this.hud.updateBorderGlow(0);
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
    this.feverTimer = FEVER_DURATION + this.skin.feverBonus;
    if (!was) {
      this.audio.feverOn();
      this.tts.announceFever();
      this.audio.yeah();
      this.audio.setMusicMode("fever");
      this.hud.toast("FEVER", "fever");
      this.flash("fever");
      this.particles.emitConfetti(this.bird.x, this.bird.y);
      this.postFX.pulseBloom(0.4, 1.8); // Dramatic bloom on fever
      this.juice.hitStop(0.08); // Big freeze on fever activation
      this.juice.shake(0.6); // Big shake on fever
      this.juice.flash(0xff6622, 0.25); // Orange flash on fever
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
        this.juice.zenithRing(this.bird.x, this.bird.y);
        this.postFX.pulseBloom(0.3, 1.8); // Zenith bloom pulse
        for (let i = 0; i < 14; i++) this.particles.emitSparkle(this.bird.x, this.bird.y);
        this.audio.zenith();
        this.tts.announceZenith();
        this.audio.woah();
        this.audio.duckMusic(0.6, 0.7);
        this.hud.toast(`ZENITH +${pts}`, "zenith");
        this.flash("perfect");
        this.haptic(25);
        this.telemetry.track("zenith", { alt: Math.round(alt) });
      }
    }
    this.prevVy = vy;
  }

  private onPickup(kind: PickupKind, x: number, y: number): void {
    this.pickups += 1;
    this.bonus += 25;
    this.audio.powerup();
    this.particles.emitCollect(x, y);
    this.haptic(16);
    const wasLive = this.powers.has(kind);
    this.powers.add(kind);
    // OVERCHARGE: doubling up while live promotes the power-up to tier II.
    if (wasLive && this.powers.level(kind) === 2) {
      // Impulse-style effects still fire — the promotion adds, never removes.
      if (kind === "rocket") {
        this.boostTimer = BOOST_TIME;
        this.bird.vx += 42;
        this.bird.vy += 8;
        this.shake(0.55);
      }
      this.particles.burstRing(x, y, 0xffffff);
      this.hud.toast(`⚡ OVERCHARGE II — ${PICKUP_STYLE[kind].label}`, "zenith");
      this.shake(0.3);
      return;
    }
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
        this.hud.toast("Rocket Speed 🚀", "power");
        this.shake(0.55);
        break;
      case "magnet":
        this.magnetTimer = MAGNET_TIME;
        this.particles.burstRing(x, y, 0x8a6cff);
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
        this.hud.toast("Wing Boost 🪽 Super Lift", "power");
        break;
      case "feather":
        this.particles.burstRing(x, y, 0xfff0c0);
        this.hud.toast("Feather 🪶 Butter Landings", "power");
        break;
      case "goldenwings":
        this.particles.burstRing(x, y, 0xffd76a);
        this.flash("perfect");
        this.audio.island();
        this.hud.toast("✨ GOLDEN WINGS ✨", "gold");
        break;
      case "cloudboost":
        this.particles.burstRing(x, y, 0xc8e8ff);
        this.hud.toast("Cloud Boost ☁ Wind Lift", "power");
        break;
      case "timefreeze":
        this.timeScale = ZENITH_SLOWMO;
        this.zenithTimer = 2.5;
        this.particles.burstRing(x, y, 0xa0d8ff);
        for (let i = 0; i < 18; i++) this.particles.emitSparkle(x, y);
        this.postFX.pulseBloom(0.35, 2.2);
        this.audio.woah();
        this.hud.toast("❄ TIME FREEZE ❄", "power");
        break;
      case "doublecoins":
        this.magnetTimer = Math.max(this.magnetTimer, 12);
        this.particles.burstRing(x, y, 0xffe840);
        this.audio.yeah();
        this.hud.toast("⚡ 2× COINS ⚡ 12s", "gold");
        break;
      case "starburst": {
        const oldCombo = this.perfectChain;
        this.perfectChain += 3;
        this.juice.comboPop();
        this.particles.burstRing(x, y, 0xff80ff);
        for (let i = 0; i < 24; i++) this.particles.emitSparkle(x, y);
        this.postFX.pulseBloom(0.5, 2.5);
        this.flash("perfect");
        this.juice.hitStop(0.1);
        this.juice.shake(0.7);
        this.audio.wow();
        this.hud.toast(`🌟 STAR BURST! Combo ×${oldCombo + 3}`, "fever");
        break;
      }
      default:
        break;
    }
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
    // No thermal line here: the ♨ HUD chip already says "release!" — three
    // simultaneous thermal texts (toast + chip + hint) was the worst offender
    // of the multiple-text bug.
    if (this.terrain.isOcean(this.bird.x + 40) && !this.terrain.isOcean(this.bird.x)) return "Build speed — then RELEASE";
    return "";
  }

  private emitTrail(): void {
    const s = this.skin.id;
    if (s === "aurora") {
      this.hueT += 0.05;
      const h = this.hueT % 1;
      const c = hsl(h, 0.9, 0.65);
      this.particles.emitSparkle(this.bird.x - 0.4, this.bird.y, c[0], c[1], c[2]);
    } else if (s === "phoenix") {
      this.particles.emitSparkle(this.bird.x - 0.4, this.bird.y, 1, 0.35 + Math.random() * 0.3, 0.1);
    } else if (s === "bluejay") {
      this.particles.emitSparkle(this.bird.x - 0.4, this.bird.y, 0.6, 0.85, 1);
    } else if (s === "owl") {
      this.particles.emitSparkle(this.bird.x - 0.4, this.bird.y, 0.75, 0.65, 1);
    } else if (s === "ember") {
      this.particles.emitSparkle(this.bird.x - 0.4, this.bird.y, 1, 0.55, 0.2);
    } else {
      this.particles.emitSparkle(this.bird.x - 0.4, this.bird.y);
    }
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
    
    // Update pet companion
    if (this.petCompanion && this.activePet) {
      this.petCompanion.update(visDt, this.bird.x, this.bird.y, this.bird.speed(), this.bird.rotation);
    }
    
    this.particles.update(visDt);
    // Biome ambient particles: leaves, sand, snow, fireflies — doubled for richness
    if (playing && Math.random() < 0.55) {
      this.particles.emitBiomeAtmosphere(this.bird.x, this.bird.y, this.terrain.biomeAt(this.bird.x).id);
    }
    this.camera.update(rawDt, this.bird, playing, this.terrain.heightAt(this.bird.x));

    this.applyWorldLook(this.bird.x, this.bird.altitude);
    this.terrain.update(this.bird.x);

    const dayT = Math.max(0, Math.min(1, this.daylight / this.daylightMax()));
    this.audio.update(rawDt, this.bird.speed(), diving, this.bird.grounded, this.feverOn, dayT, playing, this.weather.gust);

    const size = this.renderer.getSize(this.tmpSize);
    this.renderer.setViewport(0, 0, size.x, size.y);
    this.renderer.setScissorTest(false);

    // Update visual effects
    this.godRays.update(rawDt, this.bird.x + 60, 50, this.daylight, this.bird.speed(), this.terrain.biomeAt(this.bird.x).id);
    this.terrainFx.update(rawDt, this.elapsed, this.bird.x, this.terrain, this.terrain.biomeAt(this.bird.x).id);
    this.speedLines.update(rawDt, this.bird.speed(), this.bird.x, this.bird.y);

    // Update game juice — compose with zenith slowmo so hit-stop doesn't overwrite it
    const juiceScale = this.juice.update(rawDt);
    this.timeScale = (this.zenithTimer > 0 ? ZENITH_SLOWMO : 1) * juiceScale;

    // Speed-based vignette from camera rig
    this.postFX.setVignette(this.camera.vignetteIntensity);

    // Speed-based cinematic effects (desktop only — mobile skips for performance)
    const spd = this.bird.speed();
    if (!this.isMobile()) {
      const caAmount = THREE.MathUtils.lerp(0.001, 0.006, Math.min(spd / 80, 1));
      this.postFX.setChromaticAberration(caAmount);
      const grainIntensity = THREE.MathUtils.lerp(0.04, 0.09, Math.min(spd / 80, 1));
      this.postFX.setFilmGrain(grainIntensity);
    }
    const satBoost = THREE.MathUtils.lerp(1.15, 1.25, Math.min(spd / 80, 1));
    this.postFX.setSaturation(satBoost);

    // Render with post-processing (bloom, color grading, FXAA)
    // Falls back to direct render if the composer throws (old/integrated GPUs)
    try {
      this.postFX.render(rawDt);
    } catch {
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
    this.sky.setAltitude(altT);
    this.sky.setAurora(auroraVal);
    const pal = this.sky.update(dayT, x, this.elapsed);
    this.terrain.setPalette(pal, x);
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(this.sky.fogColor).lerp(this.tmpColor.setHex(biome.fogTint), 0.25);
      // Thin the haze as we climb so the whole world opens up beneath the bird.
      this.scene.fog.near = 260 + altT * 460;
      this.scene.fog.far = 1250 + altT * 1300;
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
    // Occlusion against both birds, sampled from the lead camera — a prop that
    // blocks either player's view sinks out of the way.
    this.terrain.updateOcclusion(
      [
        { x: p1.bird.x, y: p1.bird.y },
        { x: p2.bird.x, y: p2.bird.y },
      ],
      lead.camera.camera.position.x,
      lead.camera.camera.position.y,
      lead.camera.camera.position.z,
    );
    this.applyWorldLook(lead.bird.x, lead.bird.altitude);
    this.terrain.update(lead.bird.x);
    this.audio.update(rawDt, lead.bird.speed(), playing && this.input.diving, lead.bird.grounded, false, 1, playing, 0);

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
      const vw = vertical ? size.x - ox : w;
      const vh = vertical ? h : size.y - oy;
      this.renderer.setViewport(ox, oy, vw, vh);
      this.renderer.setScissor(ox, oy, vw, vh);
      racer.camera.resize(vw / Math.max(1, vh));
      this.renderer.render(this.scene, racer.camera.camera);
    }
    this.renderer.setScissorTest(false);
  }


  /* ------------------------------------------------------------- run flow */

  private startRun(): void {
    this.exitVersus();
    this.mode = modeById(this.modeId);
    this.resetRun(false);

    // Poki: call commercialBreak before gameplayStart when player shows intent to continue
    // This is the optimal placement for interstitial ads (between runs, before new run)
    if (this.platform && this.platform.name !== "none" && !this.save.state.gold) {
      const runs = this.save.state.runsPlayed;
      if (this.save.shouldShowInterstitial(runs)) {
        this.platform.commercialBreak().catch(() => {});
      }
    }

    // Daily/weekly modes override the terrain seed so every player flies the same hill.
    if (this.modeId === "daily") {
      const dailySeed = DailyChallenge.getTodaySeed();
      if (this.seed !== dailySeed) this.rebuildWorld(dailySeed);
    } else if (this.modeId === "weekly") {
      const weeklySeed = WeeklyTournament.getWeekSeed();
      if (this.seed !== weeklySeed) this.rebuildWorld(weeklySeed);
    }

    // Modes reshape the clock; Race has no sunset at all.
    this.daylight = this.mode.clock > 0 ? this.mode.clock : this.daylightMax();
    const armed = this.save.consumeArmedBoosts();
    for (const id of armed) this.applyBoost(id);

    // Skin trial: temporarily unlock all skins for this run
    if (this.skinTrialActive) {
      for (const s of SKINS) {
        if (!this.save.state.ownedSkins.includes(s.id)) {
          this.save.ownSkin(s.id);
        }
      }
      this.hud.toast("All skins unlocked for this run!", "power");
      this.audio.unlock();
      this.audio.setMusicMode("celebrate");
      setTimeout(() => this.audio.setMusicMode("play"), 2000);
    }

    // Headstart boost earned via rewarded ad
    if (this.headstartAdUsed) {
      this.applyBoost("headstart");
      this.headstartAdUsed = false; // consumed
    }

    // Gem multiplier: available for the first gem collected
    if (this.gemMultActive) {
      // stays active until a gem is collected
    } else {
      this.gemMultAvailable = false;
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
    this.audio.sleep();
    this.audio.setMusicMode("sleep");
    this.flash("sleep");
    const gold = this.save.state.gold;
    const canCoins = this.save.state.wallet >= CONTINUE_COST;
    const canAd = !gold && this.ads.isAvailable() && this.save.adsLeftToday() > 0;
    if (!this.continueUsed && (gold || canCoins || canAd)) {
      this.continueTimer = CONTINUE_TIMEOUT;
      this.setState("continue");
    } else {
      this.finishRun();
    }
  }

  private doContinue(source: string): void {
    this.continueUsed = true;
    this.bird.asleep = false;
    this.daylight = CONTINUE_DAYLIGHT;
    this.bird.y = Math.max(this.bird.y, this.terrain.heightAt(this.bird.x) + BIRD_RADIUS + 0.5);
    this.bird.vy = 16;
    this.bird.vx = Math.max(this.bird.vx, 24);
    this.bird.grounded = false;
    this.bird.inWater = false;
    this.particles.emitConfetti(this.bird.x, this.bird.y);
    this.audio.island();
    this.hud.toast("Second wind!", "island");
    this.setState("playing");
    this.telemetry.track("continue_used", { source });
  }

  private finishRun(): void {
    if (this.runRecorded) return;
    this.runRecorded = true;
    this.bird.asleep = true;
    const stats = this.runStats();

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

    // Publish this flight to the ghost network (daily seed only, best-per-
    // pilot kept server-side; silent no-op without a backend).
    if (this.seedMode === "today" && !this.versus && !this.seed.startsWith("fly-") && stats.distance > 100) {
      void publishGhost({
        seed: this.seed,
        deviceId: this.save.state.deviceId,
        name: this.racedName(),
        distance: stats.distance,
        samples: this.ghostRecorder.snapshot(),
      });
    }

    const beatGhost = this.ghostRecorder.commit(this.seed, stats.distance);
    if (beatGhost) {
      this.hud.toast("New personal ghost recorded", "gold");
      this.telemetry.track("ghost_new", { distance: Math.round(stats.distance) });
    }

    this.newlyCompleted = this.missions.applyRun(stats);
    this.claimedQuests = this.missions.claimQuests(this.today, stats);
    // Double coins: earned via rewarded ad on game over
    if (this.doubleCoinsEarned && !this.doubleCoinsUsed) {
      this.runCoins *= 2;
      this.doubleCoinsUsed = true;
      this.hud.toast(`2× coins applied! +${this.runCoins} coins`, "gold");
    }
    const score = this.score();

    // Check challenge result
    if (this.activeChallenge) {
      if (score > this.activeChallenge.score) {
        this.hud.toast(`You beat ${this.activeChallenge.from}'s score!`, "gold");
        this.audio.island();
      } else {
        this.hud.toast(`${this.activeChallenge.from} wins with ${this.activeChallenge.score} pts`, "info");
      }
      this.activeChallenge = null;
      ChallengeSystem.clearChallenge();
    }

    // FLIGHT RECAP — the run's altitude profile, drawn on the results card.
    {
      const s = this.ghostRecorder.snapshot();
      const pts: [number, number][] = [];
      const step = Math.max(1, Math.floor(s.length / 72));
      for (let i = 0; i < s.length; i += step) pts.push([s[i]![1] - this.startX, s[i]![2]]);
      if (s.length > 0) pts.push([s[s.length - 1]![1] - this.startX, s[s.length - 1]![2]]);
      this.flightPath = pts.length >= 3 ? pts : [];
    }
    const lifetimeBefore = this.save.state.lifetime.distance;
    this.save.recordRun(stats.distance, this.runCoins, score, this.today, this.island, this.terrain.biomeAt(this.bird.x).id);
    // CAREER WINGS promotion — a lifetime rank-up is rare; make it land.
    const promo = wingsPromotion(lifetimeBefore, this.save.state.lifetime.distance);
    if (promo) {
      this.audio.unlock();
      this.particles.emitConfetti(this.bird.x, this.bird.y + 4);
      this.hud.toast(`${promo.icon} ${promo.name.toUpperCase()} — lifetime rank earned`, "gold");
      this.telemetry.track("wings_promo", { tier: promo.id });
    }

    // Lifetime stat tracking
    this.save.addLifetimePerfects(this.perfects);
    this.save.addLifetimePlayTime(this.runTime);
    this.save.noteLifetimeBestCombo(this.launch.best);
    // Track biome visits for this run
    for (let i = 0; i <= this.island; i++) {
      const b = biomeForIsland(i);
      this.save.trackBiomeVisit(b.id);
    }
    this.save.persist();

    // Record to leaderboard
    const leaderResult = this.leaderboard.record(
      this.modeId,
      Math.round(score),
      Math.round(stats.distance),
      this.runCoins,
      this.perfects,
      this.skin.id,
    );
    if (leaderResult.isNewBest) {
      this.hud.toast("NEW PERSONAL BEST!", "gold");
      this.tts.announceNewBest();
      this.audio.unlock();
      this.audio.setMusicMode("celebrate");
      setTimeout(() => this.audio.setMusicMode("sleep"), 3000);
      this.postFX.pulseBloom(0.5, 2.0); // Big bloom on new record
      this.juice.shake(0.8); // Big shake on new record
    }

    // Record daily / weekly challenge scores
    if (this.modeId === "daily") {
      this.dailyResult = DailyChallenge.recordScore(Math.round(score), Math.round(stats.distance));
      this.hud.toast(`Daily rank: #${this.dailyResult.rank} of ${this.dailyResult.totalPlayers}`, "gold");
    }
    if (this.modeId === "weekly") {
      this.weeklyResult = WeeklyTournament.recordScore(Math.round(score), Math.round(stats.distance));
      this.hud.toast(`Weekly rank: #${this.weeklyResult.rank} of ${this.weeklyResult.totalPlayers}`, "gold");
    }

    // Submit to global leaderboard
    void this.globalLb
      .submit(this.save.state.deviceId.slice(0, 8), stats.distance, score, this.skin.id)
      .then(async (globalResult) => {
        this.globalLbRank = globalResult.rank;
        this.globalLbTotal = globalResult.total;
        this.globalLbTop = await this.globalLb.getTop(10);
        if (globalResult.rank > 0) {
          const label = this.globalLb.isGlobal ? "Global" : "Local";
          this.hud.toast(`${label} rank: #${globalResult.rank} of ${globalResult.total}`, "gold");
        }
        this.bump();
      })
      .catch(() => { /* network failure — leaderboard is optional */ });
    this.save.addLifetimeZeniths(stats.zenith);
    // distance XP is awarded at the end; everything else accrued live during the flight
    this.awardXp(Math.round(stats.distance * XP_RULES.perMetre));
    const tierBefore = this.seasonPass.tier();
    this.flushXp();
    const tierAfter = this.seasonPass.tier();
    const xp = this.seasonPass.xp();
    const newTrophies = this.achievements.checkNew();

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
      this.audio.tierUp();
      this.audio.setMusicMode("celebrate");
      setTimeout(() => this.audio.setMusicMode("sleep"), 2500);
      this.postFX.pulseBloom(0.3, 1.5);
    }
    if (this.claimedQuests.length) {
      const total = this.claimedQuests.reduce((a, q) => a + q.reward, 0);
      this.hud.toast(`Quest complete · +${total} coins`, "quest");
    }
    if (this.newlyCompleted.length) this.hud.toast("Nest upgraded!", "island");
    for (const t of newTrophies) {
      this.hud.toast(`Trophy: ${t.title}`, "gold");
      this.audio.trophy();
      this.audio.setMusicMode("celebrate");
      setTimeout(() => this.audio.setMusicMode("sleep"), 3000);
      this.postFX.pulseBloom(0.4, 1.8);
      this.juice.shake(0.5);
    }

    const runs = this.save.state.runsPlayed;
    const dueAd = !this.save.state.gold && this.save.shouldShowInterstitial(runs);
    if (dueAd && !this.skipInterstitialOnce && this.ads.isAvailable()) {
      this.adReason = "interstitial";
      this.telemetry.track("ad_shown", { reason: "interstitial" });
      if (this.platform) {
        // Portal SDK: commercial break between runs
        this.platform.commercialBreak().then(() => {
          this.setState("gameover");
        });
      } else {
        // Dev fallback: mock timer
        this.adTimer = this.ads.duration;
        this.setState("ad");
      }
    } else {
      this.setState("gameover");
      this.tts.announceGameOver();
      // After a great run with notifications enabled, nudge the player to share
      if (this.notif.isSubscribed() && leaderResult.isNewBest) {
        window.setTimeout(() => {
          if (this.state === "gameover" && !this.disposed) {
            this.hud.toast("Great run! Share it?", "gold");
            this.bump();
          }
        }, 2000);
      }
      
      // VIRAL: Show social proof and sharing prompts
      window.setTimeout(() => {
        if (this.state === "gameover" && !this.disposed) {
          // Social proof
          const onlineCount = Math.floor(Math.random() * 200 + 100);
          this.hud.toast(`🔥 ${onlineCount} players flying right now`, "info");
          
          // Challenge prompt for high scores
          if (score > 1000) {
            window.setTimeout(() => {
              if (this.state === "gameover" && !this.disposed) {
                this.hud.toast("🎯 Challenge a friend?", "gold");
                this.bump();
              }
            }, 1500);
          }
          
          // Friend code reminder
          window.setTimeout(() => {
            if (this.state === "gameover" && !this.disposed) {
              this.hud.toast(`Your code: ${this.save.state.referralCode} — friends get +60 coins!`, "info");
              this.bump();
            }
          }, 3000);
        }
      }, 1000);
    }
    this.skipInterstitialOnce = false;
  }

  private endAd(): void {
    this.save.recordAdImpression(this.save.state.runsPlayed);
    this.telemetry.track("ad_completed", { reason: this.adReason, left: this.save.adsLeftToday() });
    if (this.adReason === "continue") this.doContinue("ad");
    else this.setState("gameover");
  }

  /**
   * Show a rewarded ad for any of the new placements.
   * Resolves true if the player watched the full ad and earned the reward.
   * Enforces a per-session cap across all placements.
   */
  private showRewardedAd(reason: string): Promise<boolean> {
    if (this.adSessionCount >= this.AD_SESSION_CAP) {
      this.hud.toast("No more ads available this session", "warn");
      return Promise.resolve(false);
    }
    this.telemetry.track("rewarded_ad_shown", { reason });
    if (this.platform) {
      return this.platform.rewardedBreak().then((earned) => {
        if (earned) {
          this.adSessionCount++;
          this.save.recordAdImpression(this.save.state.runsPlayed);
          this.telemetry.track("rewarded_ad_completed", { reason, sessionCount: this.adSessionCount });
        }
        return earned;
      });
    }
    // Dev fallback: mock timer
    return new Promise<boolean>((resolve) => {
      this.adReason = "interstitial";
      this.adTimer = this.ads.duration;
      this.setState("ad");
      const check = () => {
        if (this.state !== "ad") {
          this.adSessionCount++;
          this.save.recordAdImpression(this.save.state.runsPlayed);
          this.telemetry.track("rewarded_ad_completed", { reason, sessionCount: this.adSessionCount });
          resolve(true);
          return;
        }
        window.setTimeout(check, 200);
      };
      window.setTimeout(check, (this.ads.duration + 0.5) * 1000);
    });
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
    this.stuckTimer = 0;
    this.lastStuckX = 64;
    this.startX = 64;
    const y = this.terrain.heightAt(this.startX) + BIRD_RADIUS;
    this.bird.reset(this.startX, y);
    this.daylight = this.daylightMax();
    this.island = 0;
    this.lastIsland = 0;
    this.perfects = 0;
    this.perfectChain = 0;
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
    this.pendingXp = 0;
    this.xpFlush = 0;
    this.magnetTimer = 0;
    this.shield = 0;
    this.boostTimer = 0;
    this.continueUsed = false;
    this.continueTimer = 0;
    this.timeScale = 1;
    this.zenithTimer = 0;
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
    this.rivalGhostPlayer.reset();
    this.rivalGhostPlayer.loadRecord(null);
    this.rivalGhostPassed = false;
    this.thermalToasted = false;
    this.flightPath = [];
    this.runEpoch += 1;
    if (!idle) {
      this.ghostPlayer.load(this.seed);
      // Async PvP: chase a REAL player's flight on today's hills. Arrives
      // quietly a moment into the run; a dead backend costs nothing.
      if (this.seedMode === "today" && !this.versus && !this.massRace.active) {
        const epoch = this.runEpoch;
        void fetchRivalGhost(this.seed, this.save.state.deviceId, this.save.state.bestDistance).then((rg) => {
          if (!rg || this.disposed || epoch !== this.runEpoch || this.state !== "playing") return;
          this.rivalGhostName = rg.name;
          this.rivalGhostPlayer.loadRecord({ seed: this.seed, distance: rg.distance, samples: rg.samples });
          this.hud.toast(`👻 ${rg.name} flew ${Math.round(rg.distance)} m here — chase them`, "quest");
        });
      }
    }
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
      case "retry":
        if (this.state !== "ad" && this.state !== "continue") this.startRun();
        break;
      case "pause":
        if (this.state === "playing") this.setState("paused");
        break;
      case "resume":
        if (this.state === "paused") this.setState("playing");
        break;
      case "menu":
        if (this.state === "paused") {
          if (!this.giveUpArmed) {
            this.giveUpArmed = true;
            this.hud.toast("Tap again to give up", "warn");
            this.bump();
            break;
          }
          this.giveUpArmed = false;
        }
        this.exitVersus();
        this.goToMenu();
        break;
      case "open-shop":
        this.setScreen("shop");
        break;
      case "open-paywall":
        this.restoreMessage = "";
        this.setScreen("paywall");
        this.telemetry.track("paywall_open", { from: this.state });
        break;
      case "open-settings":
        this.setScreen("settings");
        break;
      case "open-scores":
        this.setScreen("scores");
        void this.globalLb.getTop(10).then((top) => {
          this.globalLbTop = top;
          this.bump();
        });
        break;
      case "open-stats":
        this.setScreen("stats");
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
      case "set-music":
        this.save.state.settings.music = !this.save.state.settings.music;
        this.save.persist();
        this.applySettings();
        break;
      case "back":
        this.checkoutOk = false;
        this.checkoutWaiting = false;
        this.setScreen(this.screen === "checkout" ? "paywall" : "main");
        break;
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
      case "gold-buy":
        if (this.portalNoStripe) {
          this.portalRewardedUnlock("sunbird_gold");
        } else {
          this.openCheckout("sunbird_gold");
        }
        break;
      case "vip-buy":
        if (this.portalNoStripe) {
          this.portalRewardedUnlock("sunbird_vip");
        } else {
          this.openCheckout("sunbird_vip");
        }
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
      case "share":
        void this.shareRun();
        break;
      case "challenge-friend":
        this.challengeFriend();
        break;
      case "show-leaderboard":
        this.setScreen("scores");
        break;
      case "copy-friend-code":
        void navigator.clipboard?.writeText(this.save.state.referralCode);
        this.hud.toast("Friend code copied!", "info");
        break;
      case "install-app":
        void this.installApp();
        break;
      case "continue-coins":
        if (this.state === "continue" && this.save.spend(CONTINUE_COST)) this.doContinue("coins");
        break;
      case "continue-ad":
        if (this.state === "continue") {
          this.adReason = "continue";
          this.telemetry.track("ad_shown", { reason: "continue" });
          if (this.platform) {
            // Portal SDK: rewarded ad → resume on success, stay on screen on fail
            this.platform.rewardedBreak().then((earned) => {
              if (earned) this.doContinue("ad");
              // If not earned, player stays on continue screen
            });
          } else {
            // Dev fallback: mock timer
            this.adTimer = this.ads.duration;
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
      case "claim-pass-all":
        this.claimPassAll();
        break;
      case "share-trophy":
        void this.shareTrophy(id);
        break;
      case "set-mute":
        this.save.state.settings.mute = !this.save.state.settings.mute;
        this.save.persist();
        this.applySettings();
        break;
      case "set-voice":
        this.save.state.settings.voiceEnabled = !this.save.state.settings.voiceEnabled;
        this.save.persist();
        if (this.save.state.settings.voiceEnabled) this.voice.start();
        else this.voice.stop();
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
      case "set-tts":
        this.save.state.settings.tts = !this.save.state.settings.tts;
        this.tts.setEnabled(this.save.state.settings.tts);
        this.save.persist();
        this.bump();
        break;
        break;
      case "set-quality": {
        const order = ["auto", "high", "low"] as const;
        const cur = this.save.state.settings.quality;
        this.save.state.settings.quality = order[(order.indexOf(cur) + 1) % order.length]!;
        this.save.persist();
        this.applySettings();
        break;
      }
      case "change-name":
        this.nameInput.open();
        break;
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
      /* --- rewarded ad placements --- */
      case "ad-double-coins": {
        if (this.doubleCoinsUsed || this.doubleCoinsEarned) break;
        void this.showRewardedAd("double-coins").then((earned) => {
          if (earned) {
            this.doubleCoinsEarned = true;
            this.hud.toast("2× coins earned! Coins will double at game over", "gold");
            this.audio.ding();
          }
          this.bump();
        });
        break;
      }
      case "ad-skin-trial": {
        if (this.skinTrialActive) break;
        void this.showRewardedAd("skin-trial").then((earned) => {
          if (earned) {
            this.skinTrialActive = true;
            this.hud.toast("All skins unlocked for next run!", "gold");
            this.audio.ding();
          }
          this.bump();
        });
        break;
      }
      case "ad-bonus-quest": {
        if (this.bonusQuestEarned) break;
        void this.showRewardedAd("bonus-quest").then((earned) => {
          if (earned) {
            this.bonusQuestEarned = true;
            this.save.addCoins(50);
            this.hud.toast("Bonus quest earned! +50 coins", "gold");
            this.audio.ding();
          }
          this.bump();
        });
        break;
      }
      case "ad-headstart": {
        if (this.headstartAdUsed) break;
        void this.showRewardedAd("headstart").then((earned) => {
          if (earned) {
            this.headstartAdUsed = true;
            this.hud.toast("Headstart boost armed for next flight!", "power");
            this.audio.ding();
          }
          this.bump();
        });
        break;
      }
      case "ad-gem-mult": {
        if (this.gemMultActive) break;
        void this.showRewardedAd("gem-mult").then((earned) => {
          if (earned) {
            this.gemMultActive = true;
            this.hud.toast("5× gem value active for this run!", "gold");
            this.audio.ding();
          }
          this.gemMultAvailable = false;
          this.bump();
        });
        break;
      }
      case "ad-streak-save": {
        if (this.streakSaveUsed) break;
        void this.showRewardedAd("streak-save").then((earned) => {
          if (earned) {
            this.streakSaveUsed = true;
            // Restore the streak by backdating last played to yesterday
            const yesterday = dateSeed(new Date(Date.now() - 86400000));
            this.save.state.streak.last = yesterday;
            this.save.persist();
            this.hud.toast("Streak saved!", "gold");
            this.audio.ding();
          }
          this.bump();
        });
        break;
      }
      case "ad-shield-refill": {
        if (this.shieldRefillUsed || this.shield > 0) break;
        void this.showRewardedAd("shield-refill").then((earned) => {
          if (earned) {
            this.shield = 1;
            this.powers.shield = 1;
            this.shieldRefillUsed = true;
            this.hud.toast("Shield refilled!", "power");
            this.audio.ding();
            this.particles.burstRing(this.bird.x, this.bird.y, 0x5ad8ff);
          }
          this.bump();
        });
        break;
      }
      /* --- online multiplayer --- */
      case "open-multiplayer":
        if (!MULTIPLAYER_WS_URL) {
          this.hud.toast("Multiplayer requires a server — set VITE_MULTIPLAYER_WS_URL", "warn");
          break;
        }
        this.setScreen("multiplayer");
        break;
      case "create-room":
        this.ensureOnlineMp();
        this.onlineMp.setPlayerName(this.mpDisplayName());
        this.mpState = "connecting";
        this.onlineMp.createRoom("race");
        this.mpChat = [];
        this.hud.toast(`Creating room ${this.onlineMp.getRoomCode()}…`, "info");
        this.bump();
        break;
      case "join-room": {
        const code = this.hud.readValue("roomCode").trim().toUpperCase();
        if (!code || code.length !== 6) {
          this.hud.toast("Enter a 6-character room code", "warn");
          break;
        }
        this.ensureOnlineMp();
        this.onlineMp.setPlayerName(this.mpDisplayName());
        this.mpState = "connecting";
        this.onlineMp.joinRoom(code);
        this.hud.toast(`Joining room ${code}...`, "info");
        this.bump();
        break;
      }
      case "leave-room":
        this.onlineMp?.leaveRoom();
        this.mpState = "idle";
        this.mpPlayers = [];
        this.mpChat = [];
        this.setScreen("main");
        this.bump();
        break;
      case "ready-up":
        this.onlineMp?.setReady(true);
        this.hud.toast("Ready!", "info");
        this.bump();
        break;
      case "select-color": {
        const colorId = id;
        if (this.multiplayerColors.selectColor(colorId)) {
          const color = this.multiplayerColors.getSelectedColor();
          // Apply color to bird in multiplayer
          if (this.mp) {
            this.mp.p2.bird.applySkin(this.multiplayerColors.getBirdSkin(color));
          }
          this.hud.toast(`Color changed to ${color.name}`, "info");
          this.bump();
        }
        break;
      }
      case "start-mp-race":
        this.onlineMp?.startRace();
        this.mpState = "racing";
        this.bump();
        break;
      case "send-chat": {
        const msg = this.hud.readValue("chatInput").trim();
        if (!msg) break;
        this.onlineMp?.sendChat(msg);
        this.mpChat.push({ from: "You", msg: msg.slice(0, 200) });
        if (this.mpChat.length > 50) this.mpChat.splice(0, this.mpChat.length - 50);
        this.bump();
        break;
      }
      case "enable-notifications":
        void this.notif.requestPermission().then((ok) => {
          if (ok) this.hud.toast("Notifications enabled", "info");
          else this.hud.toast("Notifications unavailable", "warn");
          this.bump();
        });
        break;
      default:
        break;
    }
  }

  private handleVoiceCommand(cmd: VoiceCommand): void {
    if (cmd === "dive") this.input.setDiv(true);
    else if (cmd === "glide") this.input.setDiv(false);
    else if (cmd === "pause" && this.state === "playing") this.setState("paused");
    else if (cmd === "resume" && this.state === "paused") this.setState("playing");
    else if (cmd === "menu") this.goToMenu();
  }

  private handleHotkeys(): void {
    if (this.input.consumePause()) {
      if (this.state === "playing") this.setState("paused");
      else if (this.state === "paused") this.setState("playing");
      else if (this.screen !== "main" && !this.checkoutBusy) this.setScreen("main");
    }
    if (this.input.consumeRestart()) {
      if (this.state === "gameover" || this.state === "playing" || this.state === "paused") this.startRun();
    }
    // Performance dashboard toggle (F3 key)
    if (this.input.consumeF3()) {
      this.perfDashboard.toggle();
    }
  }

  private goToMenu(): void {
    if (this.state === "playing" || this.state === "paused") {
      this.telemetry.track("run_abandon", { distance: Math.round(this.bird.x - this.startX) });
    }
    this.resetRun(true);
    this.menuBirdT = 0;
    this.setState("menu");
    this.setScreen("main");
    this.camera.setIntro(1);
  }

  private buySkin(id: string): void {
    const def = skinById(id);
    const st = this.save.state;
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
    if (!this.save.spend(def.price)) {
      this.hud.toast(`Need ${def.price - st.wallet} more coins`, "warn");
      return;
    }
    this.save.armBoost(id);
    this.audio.purchase();
    this.hud.toast(`${def.icon} ${def.name} armed`, "power");
    this.telemetry.track("boost_bought", { id, price: def.price });
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

  private claimPassAll(): void {
    let claimed = 0;
    for (const t of this.seasonPass.view()) {
      if (t.unlocked && !t.freeClaimed) {
        if (this.seasonPass.claim(t.tier, "free")) claimed++;
      }
      if (t.unlocked && !t.premiumLocked && !t.premiumClaimed) {
        if (this.seasonPass.claim(t.tier, "premium")) claimed++;
      }
    }
    if (claimed > 0) {
      this.audio.ding();
      this.hud.toast(`${claimed} rewards claimed!`, "gold");
    }
    this.bump();
  }

  private async shareTrophy(id: string): Promise<void> {
    const view = this.achievements.view().find((v) => v.def.id === id);
    if (!view) return;
    try {
      const card = await buildShareCard({
        distance: this.save.state.bestDistance,
        coins: this.save.state.totalCoins,
        score: this.save.state.bestScore,
        skin: this.skin,
        referralCode: this.save.state.referralCode,
        seedLabel: `Trophy: ${view.def.title}`,
      });
      const result = await shareOrDownload(card);
      this.hud.toast(result === "shared" ? "Trophy shared!" : "Trophy image saved", "info");
    } catch {
      this.hud.toast("Couldn't build share card", "warn");
    }
  }

  /* ----------------------------------------------------------- checkout */

  /** Portal-only: trigger a rewarded ad instead of Stripe checkout. */
  private portalRewardedUnlock(sku: Sku): void {
    if (!this.platform) return;
    this.telemetry.track("checkout_portal_start", { sku, platform: this.paymentPlatform() });
    this.platform.rewardedBreak().then((earned) => {
      if (this.disposed) return;
      if (earned) {
        this.grantSku(sku, `portal_ad_${this.paymentPlatform()}`);
      }
      // If not earned, player stays on paywall — nothing changes
    });
  }

  private openCheckout(sku: Sku): void {
    this.checkoutSku = sku;
    this.checkoutError = "";
    this.checkoutOk = false;
    this.checkoutWaiting = false;
    if (this.portalNoStripe) {
      // Skip the checkout screen entirely — go straight to rewarded ad flow
      this.portalRewardedUnlock(sku);
      return;
    }
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
    const link = stripeLinkFor(this.checkoutSku, this.save.state.deviceId);
    if (!link) return;
    window.open(link, "_blank", "noopener,noreferrer");
    this.checkoutWaiting = true;
    this.telemetry.track("checkout_start", { sku: this.checkoutSku, mode: "stripe" });
    this.bump();
  }

  private confirmStripeManually(): void {
    // Only allow manual confirmation in dev/standalone mode (not on portals)
    if (this.platform?.name !== "none" && this.platform?.name != null) {
      this.hud.toast("Manual confirmation not available on portals", "warn");
      return;
    }
    const res = this.mockPayments.confirmManual(this.checkoutSku);
    if (res.ok) {
      this.checkoutOk = true;
      this.grantSku(this.checkoutSku, "stripe_selfserve");
    }
    this.bump();
  }

  private handleStripeReturn(): void {
    const sku = consumeStripeReturn();
    if (!sku) return;
    this.grantSku(sku, "stripe_redirect");
    this.checkoutSku = sku;
    this.checkoutOk = true;
    this.setScreen("checkout");
    this.setState("menu");
    // Upgrade the receipt to server-verified once the webhook lands (webhooks
    // typically beat the redirect, but poll once more after a short grace).
    void this.syncServerEntitlements();
    window.setTimeout(() => void this.syncServerEntitlements(), 5000);
  }

  /** Pull webhook-verified purchases from the backend and grant any missing.
   * Silent no-op when no backend is configured — local flow is unchanged. */
  private async syncServerEntitlements(): Promise<void> {
    const skus = await fetchServerEntitlements(this.save.state.deviceId);
    if (this.disposed || skus.length === 0) return;
    for (const sku of skus) {
      const owned =
        sku === "sunbird_gold" ? this.save.state.gold
        : sku === "sunbird_vip" ? this.save.isVipActive()
        : this.save.state.starterPack;
      if (!owned) this.grantSku(sku, "stripe_webhook");
    }
  }

  private grantSku(sku: Sku, source: string): void {
    if (sku === "sunbird_vip") this.grantVip(source);
    else this.grantGold(source);
  }

  private restore(): void {
    this.restoreMessage = "Checking…";
    this.bump();
    // Server-verified entitlements first (authoritative), local receipts second.
    void this.syncServerEntitlements();
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
      const distance = Math.max(0, this.bird.x - this.startX);
      const score = this.score();
      const challengeUrl = ChallengeSystem.createChallengeUrl({
        from: this.save.state.deviceId.slice(0, 8),
        score: Math.round(score),
        distance,
        seed: this.seed,
        skin: this.skin.id,
        mode: this.modeId,
      });
      const card = await buildShareCard({
        distance,
        coins: this.runCoins,
        score,
        skin: this.skin,
        referralCode: this.save.state.referralCode,
        seedLabel: this.seedLabel(),
        challengeUrl,
      });
      const result = await shareOrDownload(card);
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

  /** Challenge a friend - creates a shareable challenge URL */
  private challengeFriend(): void {
    const score = this.score();
    const distance = this.bird.x - this.startX;
    const challengeUrl = ChallengeSystem.createChallengeUrl({
      from: this.save.state.deviceId.slice(0, 8),
      score: Math.round(score),
      distance: Math.round(distance),
      seed: this.seed,
      skin: this.skin.id,
      mode: this.modeId,
    }, window.location.origin);
    
    // Copy challenge URL to clipboard
    void navigator.clipboard?.writeText(challengeUrl);
    this.hud.toast("Challenge link copied! Send to a friend", "gold");
    this.telemetry.track("challenge_created", { score: Math.round(score) });
  }


  /** Display name used in multiplayer lobbies and leaderboards */
  private mpDisplayName(): string {
    const tutorialName = this.enhancedTutorial?.getName?.() ?? "";
    if (tutorialName.trim()) return tutorialName.trim();
    return `Pilot-${this.save.state.deviceId.slice(-4).toUpperCase()}`;
  }

  private ensureOnlineMp(): void {
    if (!this.onlineMp) {
      this.onlineMp = new OnlineMultiplayer(MULTIPLAYER_WS_URL);
      // Send the player's chosen name so the lobby shows it (fallback: device tag)
      this.onlineMp.setPlayerName(this.mpDisplayName());
      this.onlineMp.onRoomUpdate((room) => {
        this.mpPlayers = room.players.map((p: RoomPlayer) => ({
          name: p.name, color: p.color, ready: p.ready,
          distance: p.distance, alive: p.alive, rank: p.rank,
        }));
        // First server confirmation promotes the UI out of "Connecting..."
        if (this.mpState === "connecting" || this.mpState === "idle") {
          this.mpState = room.state === "lobby" ? "lobby" : room.state;
        }
        this.bump();
      });
      this.onlineMp.onErrorMessage((msg) => {
        this.hud.toast(msg, "warn");
        this.bump();
      });
      this.onlineMp.onPlayerMove((p: RoomPlayer) => {
        const existing = this.mpPlayers.find(pl => pl.name === p.name);
        if (existing) {
          existing.distance = p.distance;
          existing.alive = p.alive;
          existing.rank = p.rank;
        }
      });
      this.onlineMp.onRaceFinished((results: RoomPlayer[]) => {
        this.mpState = "results";
        this.mpPlayers = results.map((p: RoomPlayer) => ({
          name: p.name, color: p.color, ready: p.ready,
          distance: p.distance, alive: p.alive, rank: p.rank,
        }));
        this.hud.toast("Race finished!", "gold");
        this.bump();
      });
      this.onlineMp.onChatMessage((from, msg) => {
        this.mpChat.push({ from, msg });
        if (this.mpChat.length > 50) this.mpChat.splice(0, this.mpChat.length - 50);
        this.bump();
      });
      this.onlineMp.onDisconnected(() => {
        this.mpState = "idle";
        this.mpPlayers = [];
        this.mpChat = [];
        this.hud.toast("Disconnected from server", "warn");
        this.bump();
      });
    }
  }

  private grantGold(source: string): void {
    this.save.setGold(true);
    this.save.ownSkin("phoenix");
    this.audio.unlock();
    this.audio.setMusicMode("celebrate");
    setTimeout(() => this.audio.setMusicMode("menu"), 3000);
    this.particles.emitConfetti(this.bird.x, this.bird.y + 3);
    this.postFX.pulseBloom(0.5, 2.0);
    this.juice.shake(0.8);
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
    this.audio.unlock();
    this.audio.setMusicMode("celebrate");
    setTimeout(() => this.audio.setMusicMode("menu"), 3000);
    this.particles.emitConfetti(this.bird.x, this.bird.y + 3);
    this.postFX.pulseBloom(0.5, 2.0);
    this.juice.shake(0.8);
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
    if (this.seed === seed) return;
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

  private paymentPlatform(): "poki" | "crazy" | "none" {
    return this.platform?.name ?? "none";
  }

  /** Check if the player's streak is about to break (last play was 2+ days ago). */
  private canStreakBreak(): boolean {
    const streak = this.save.state.streak;
    if (streak.days <= 0) return false;
    const yesterday = dateSeed(new Date(Date.now() - 86400000));
    // Streak breaks if last played was NOT yesterday and NOT today
    return streak.last !== this.today && streak.last !== yesterday;
  }

  /** Whether the current platform forbids external payment (Stripe). */
  private get portalNoStripe(): boolean {
    const p = this.paymentPlatform();
    return p === "poki" || p === "crazy";
  }

  private get skin(): SkinDef {
    return skinById(this.save.state.activeSkin);
  }

  private daylightMax(): number {
    return (this.save.state.gold ? DAYLIGHT_MAX_GOLD : DAYLIGHT_MAX) + this.skin.daylightBonus;
  }

  private applySkin(): void {
    const s = this.skin;
    this.bird.applySkin({ body: s.body, wing: s.wing, belly: s.belly, beak: s.beak });
  }

  /** Load the equipped pet from save data */
  private loadEquippedPet(): void {
    const savedPetId = localStorage.getItem('sunbird-equipped-pet');
    if (savedPetId && this.petCompanion) {
      const petConfig = PET_CONFIGS.find(p => p.id === savedPetId);
      if (petConfig) {
        this.activePet = petConfig;
        this.petCompanion.setPet(petConfig);
      }
    }
  }

  private applySettings(): void {
    const s = this.save.state.settings;
    this.audio.setMuted(s.mute);
    this.audio.setMusicEnabled(s.music);
    this.audio.setVolumes(s.musicVolume, s.sfxVolume);
    this.camera.setReduceMotion(s.reduceMotion);
    this.dpr = this.preferredDpr();
    // Soft shadows are the single priciest feature on mobile GPUs — keep them
    // only when the user asked for high quality (auto tiers shed them first).
    const wantShadows = s.quality === "high" || (s.quality === "auto" && this.frameEma < 1 / 30);
    if (this.renderer.shadowMap.enabled !== wantShadows) this.renderer.shadowMap.enabled = wantShadows;
    this.resize();
    this.bump();
  }

  private isMobile(): boolean {
    return navigator.maxTouchPoints > 0 || window.innerWidth < 768;
  }

  private preferredDpr(): number {
    if (this.isMobile()) return 1; // always 1 on mobile — huge perf win
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
    } else if (this.frameEma < 1 / 58 && this.renderer.shadowMap.enabled === false && this.save.state.settings.quality === "auto") {
      // Headroom is back — restore soft shadows (they were only shed under load).
      this.renderer.shadowMap.enabled = true;
    }
  }

  private shake(amount: number): void {
    this.camera.bump(amount);
  }

  private flash(kind: "perfect" | "fever" | "island" | "sleep"): void {
    if (this.save.state.settings.reduceMotion && kind !== "sleep") return;
    this.hud.flash(kind);
  }

  private haptic(ms: number): void {
    if (!this.save.state.settings.haptics) return;
    try {
      navigator.vibrate?.(ms);
    } catch {
      /* unsupported */
    }
  }

  private setState(s: GameState): void {
    const prev = this.state;
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
    else if (s === "playing") this.audio.setMusicMode(this.feverOn ? "fever" : "play");

    // Platform SDK state signals
    if (this.platform) {
      if (s === "playing" && prev !== "playing") this.platform.gameplayStart();
      if (prev === "playing" && s !== "playing") this.platform.gameplayStop();
    }

    // Voice control: start listening when playing, stop otherwise
    if (this.save.state.settings.voiceEnabled) {
      if (s === "playing") this.voice.start();
      else this.voice.stop();
    }

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
    this.screen = s;
    this.menuHold = 0;
    this.needRelease = true;
    this.bump();
  }

  private bump(): void {
    this.uiVersion += 1;
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

  private score(): number {
    return (this.scoreAccum + this.bonus) * this.save.nestMultiplier();
  }

  private seedLabel(): string {
    if (this.seedMode === "yesterday") return `Yesterday's hills · ${formatDatePretty(this.seed)}`;
    if (this.seedMode === "random") return `Wild hills · ${this.seed.replace("wild-", "").toUpperCase()}`;
    return `Hills of ${formatDatePretty(this.seed)}`;
  }

  private computeFavoriteBiome(): string {
    const bv = this.save.state.lifetime.biomeVisits;
    let bestId = "";
    let bestCount = 0;
    for (const [id, count] of Object.entries(bv)) {
      if (count > bestCount) {
        bestCount = count;
        bestId = id;
      }
    }
    if (!bestId) return "";
    // Look up the biome display name
    const b = BIOMES.find((biome) => biome.id === bestId);
    return b ? `${b.emoji} ${b.name}` : bestId;
  }

  private ghostDelta(): number | null {
    if (!this.ghostPlayer.active) return null;
    const dist = Math.max(0, this.bird.x - this.startX);
    const t = Math.min(this.runTime, 99999);
    const gx = this.ghostPlayer.update(t, 0);
    if (gx === null) return dist - this.ghostPlayer.bestDistance();
    return this.bird.x - gx;
  }

  private refreshViews(): void {
    const st = this.save.state;
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
    this.boostViews = BOOSTS.map((def) => ({ def, armed: st.armedBoosts.includes(def.id), affordable: st.wallet >= def.price }));
    this.viewsVersion = this.uiVersion;
  }

  private pushHud(): void {
    if (this.viewsVersion !== this.uiVersion) this.refreshViews();
    if (this.hudVersion === this.uiVersion) return;
    this.hudVersion = this.uiVersion;
    const st = this.save.state;
    const stats = this.runStats();
    this._hudBiome = this.terrain.biomeAt(this.bird.x);
    let todayBest = 0;
    for (const h of st.highScores) if (h.date === this.today && h.distance > todayBest) todayBest = h.distance;
    const sTier = this.seasonPass.tier();
    const sProg = this.seasonPass.progressInTier();
    const snap: HudSnapshot = {
      state: this.state,
      screen: this.screen,
      checkoutSku: this.checkoutSku,
      version: this.uiVersion,
      distance: stats.distance,
      coins: this.runCoins,
      daylight: this.daylight,
      daylightMax: this.daylightMax(),
      fever: this.feverOn ? this.feverTimer / (FEVER_DURATION + this.skin.feverBonus) : this.perfectChain / FEVER_NEED,
      feverOn: this.feverOn,
      multiplier: this.save.nestMultiplier() * (this.feverOn ? 2 : 1),
      bestDistance: st.bestDistance,
      isNewBest: this.score() > (st.highScores[0]?.score ?? 0),
      score: this.score(),
      island: this.island,
      perfects: this.perfects,
      clouds: this.runClouds,
      zeniths: this.zeniths,
      hint: this.state === "playing" ? this.hint : "",
      magnetTimer: this.magnetTimer,
      shield: this.shield,
      boostTimer: this.boostTimer,
      gold: st.gold,
      vip: this.save.isVipActive(),
      vipDaysLeft: this.save.vipDaysLeft(),
      vipExpiredNotice: this.vipExpiredNotice,
      adsLeftToday: this.save.adsLeftToday(),
      ghostDelta: this.state === "playing" || this.state === "gameover" ? this.ghostDelta() : null,
      continueTimer: this.continueTimer,
      continueCost: CONTINUE_COST,
      canAffordContinue: st.wallet >= CONTINUE_COST,
      adAvailable: this.ads.isAvailable(),
      adTimer: this.adTimer,
      adTotal: this.ads.duration,
      adReason: this.adReason,
      seedLabel: this.seedLabel(),
      seedMode: this.seedMode,
      wallet: st.wallet,
      streakDays: st.streak.days,
      nestLevel: st.nestLevel,
      nestMult: this.save.nestMultiplier(),
      missions: this.missionViews,
      quests: this.questViews,
      highScores: st.highScores,
      todayBest,
      runsPlayed: st.runsPlayed,
      newlyCompleted: this.newlyCompleted,
      claimedQuests: this.claimedQuests,
      skins: this.skinViews,
      boosts: this.boostViews,
      settings: st.settings,
      goldPrice: GOLD.price,
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
      canInstall: Boolean(this.deferredInstall),
      shareBusy: this.shareBusy,
      combo: Math.max(this.perfectChain, this.versus && this.p1 ? this.p1.launch.combo : this.launch.combo),
      speedNorm: Math.min(1, this.bird.speed() / 100),
      gust: this.weather.gust,
      inThermal: this.weather.inThermal,
      biomeName: this._hudBiome.name,
      biomeEmoji: this._hudBiome.emoji,
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
      platform: this.paymentPlatform(),
      showTutorialHand: this.state === "playing" && st.tutorialRuns < 2 && this.hintTimer < 2.6 && !this.input.diving,
      globalLbRank: this.globalLbRank,
      globalLbTotal: this.globalLbTotal,
      globalLbTop: this.globalLbTop,
      doubleCoinsAvailable: this.state === "gameover" && this.runCoins > 0 && this.adSessionCount < this.AD_SESSION_CAP,
      doubleCoinsEarned: this.doubleCoinsEarned,
      doubleCoinsUsed: this.doubleCoinsUsed,
      skinTrialAvailable: this.screen === "shop" && this.adSessionCount < this.AD_SESSION_CAP,
      skinTrialActive: this.skinTrialActive,
      bonusQuestAvailable: (this.state === "menu" || this.state === "gameover") && !this.bonusQuestEarned && this.adSessionCount < this.AD_SESSION_CAP,
      bonusQuestEarned: this.bonusQuestEarned,
      bonusQuestLabel: this.pendingBonusQuestLabel,
      headstartAdAvailable: this.state === "gameover" && !this.headstartAdUsed && this.adSessionCount < this.AD_SESSION_CAP,
      headstartAdUsed: this.headstartAdUsed,
      gemMultAvailable: this.gemMultAvailable,
      gemMultActive: this.gemMultActive,
      streakSaveAvailable: this.canStreakBreak() && !this.streakSaveUsed && this.adSessionCount < this.AD_SESSION_CAP,
      streakBroken: this.canStreakBreak(),
      shieldRefillAvailable: this.state === "playing" && this.shield <= 0 && !this.shieldRefillUsed && this.adSessionCount < this.AD_SESSION_CAP,
      shieldRefillUsed: this.shieldRefillUsed,
      platformReady: Boolean(this.platform),
      notifSupported: this.notif.isSupported(),
      notifSubscribed: this.notif.isSubscribed(),
      ttsEnabled: this.save.state.settings.tts,
      voiceEnabled: this.save.state.settings.voiceEnabled,
      voiceSupported: this.voice.isSupported(),
      multiplayerAvailable: Boolean(MULTIPLAYER_WS_URL),
      mpState: this.mpState,
      mpRoomCode: this.onlineMp?.getRoomCode() ?? "",
      mpPlayers: this.mpPlayers,
      mpChat: this.mpChat,
      mpIsHost: this.onlineMp?.getIsHost() ?? false,
      mpConnected: this.onlineMp?.getIsConnected() ?? false,
      selectedColor: this.multiplayerColors.getSelectedColor().id,
      totalFlights: st.runsPlayed,
      totalDistance: st.lifetime.distance,
      totalCoins: st.totalCoins,
      seasonDaysLeft: this.seasonPass.getDaysUntilReset(),
      seasonProgress: this.seasonPass.getSeasonProgress(),
      achievementShowcase: this.achievements.view().filter(v => v.unlocked).sort((a, b) => {
        const rank: Record<string, number> = { platinum: 4, gold: 3, silver: 2, bronze: 1 };
        return (rank[b.def.rarity] ?? 0) - (rank[a.def.rarity] ?? 0);
      }).slice(0, 3),
      streakDaysCount: st.streak.days,
      challengeFrom: this.activeChallenge?.from ?? "",
      challengeScore: this.activeChallenge?.score ?? 0,
      challengeActive: this.activeChallenge !== null,
      dailyResult: this.dailyResult,
      weeklyResult: this.weeklyResult,
      dailyPlayed: DailyChallenge.hasPlayedToday(),
      dailyTopScores: DailyChallenge.getTopScores(5),
      dailyTimeLeft: DailyChallenge.getTimeUntilReset(),
      dailyLabel: DailyChallenge.getDayLabel(),
      weeklyPlayed: WeeklyTournament.hasPlayedThisWeek(),
      weeklyTopScores: WeeklyTournament.getTopScores(5),
      weeklyTimeLeft: WeeklyTournament.getTimeUntilReset(),
      weeklyLabel: WeeklyTournament.getWeekLabel(),
      /* --- run statistics --- */
      lifetimePerfects: st.lifetime.perfects,
      lifetimePlayTime: st.lifetime.playTime,
      lifetimeBestCombo: st.lifetime.bestCombo,
      lifetimeBiomeVisits: st.lifetime.biomeVisits,
      favoriteBiome: this.computeFavoriteBiome(),
      averageRunDistance: st.runsPlayed > 0 ? st.lifetime.distance / st.runsPlayed : 0,
      playerName: st.playerName ?? "",
      wings: this.wingsCard(),
      flightPath: this.state === "gameover" ? this.flightPath : [],
    };
    this.hud.update(snap);
  }

  private wingsCard(): { icon: string; name: string; progress: number; nextName: string; nextNeeded: number; lifetime: number } {
    const d = this.save.state.lifetime.distance;
    const cur = wingsFor(d);
    const nxt = nextWings(d);
    return {
      icon: cur.icon,
      name: cur.name,
      progress: wingsProgress(d),
      nextName: nxt?.tier.name ?? cur.name,
      nextNeeded: nxt?.needed ?? 0,
      lifetime: d,
    };
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
    const mobile = this.isMobile();
    this.dpr = this.preferredDpr();
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.postFX.resize(w, h, this.dpr);
    this.postFX.setMobileMode(mobile);
    this.camera.resize(w / Math.max(1, h));
    // Portrait/mobile: wider FOV so scene isn't zoomed-in and cramped
    const baseFov = mobile && h > w ? 72 : 50;
    this.camera.setBaseFov(baseFov);
    if (this.p1 && this.p2) {
      const vertical = w / Math.max(1, h) >= 1.25;
      this.input.splitMode = this.versus ? (vertical ? "vertical" : "horizontal") : "off";
    }
  }
}
