import * as THREE from "three";
import { Achievements, type AchievementView } from "./Achievements";
import { GameAudio } from "./Audio";
import { BIOMES, biomeForIsland } from "./Biomes";
import { Bird, type BirdStepOpts } from "./Bird";
import { CameraRig } from "./CameraRig";
import { Collectibles, type CloudKind, type PickupKind } from "./Collectibles";
import { evaluateNearMiss, FlowTuner, SessionGoals, type NearMiss } from "./Engagement";
import { LaunchSystem, ratingLabel, type LaunchResult } from "./LaunchSystem";
import { MASS_RACE_FIELD, MODES, modeById, RACE_FINISH, type ModeDef, type ModeId } from "./Modes";
import { MassRace } from "./MassRace";
import { FinishGate } from "./FinishGate";
import { isMultiplayerConfigured, makeRoomCode, RealtimeClient } from "./Realtime";
import { Leaderboard, loadPilotName, savePilotName, isLeaderboardOnline, type BoardMetric, type BoardPage, type BoardScope } from "./Leaderboard";
import { Tournaments, TRAILS, type PrizeGrant, type TournamentView } from "./Tournaments";
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
import { BOOSTS, GOLD, PROMO_CODES, SKINS, VIP, skinById, type BoostView, type SkinDef, type SkinView } from "./Economy";
import { GhostPlayer, GhostRecorder } from "./Ghost";
import { HUD, type CheckoutMode, type HudSnapshot, type SeedMode, type UiScreen, type UiState } from "./HUD";
import { Input } from "./Input";
import { clamp, dateSeed, formatDatePretty, lerp } from "./math";
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
import { SaveData } from "./SaveData";
import { SeasonPass, seasonId, seasonLabel, XP_RULES } from "./SeasonPass";
import { buildShareCard, shareOrDownload } from "./Social";
import { initPlatform, isPortalBuild, portalTarget, type PlatformAdapter } from "../sdk/platform";
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
  private readonly sky: Sky;
  private readonly mockPayments = new MockPaymentProvider();
  private readonly ads: AdProvider = new MockAdProvider();
  private platform: PlatformAdapter | null = null;
  private readonly telemetry = new Telemetry();
  private readonly ghostRecorder = new GhostRecorder();
  private readonly ghostPlayer = new GhostPlayer();
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
  // Derived view caches — recomputed only when the UI version changes instead
  // of allocating fresh arrays every animation frame.
  private seasonView: { tier: number; maxTier: number; have: number; need: number; label: string; tiers: ReturnType<SeasonPass["view"]> } = {
    tier: 0,
    maxTier: 0,
    have: 0,
    need: 0,
    label: "",
    tiers: [],
  };
  private trophyViews: AchievementView[] = [];
  private trophyCounts = { unlocked: 0, total: 0 };
  private cupViews: TournamentView[] = [];
  private trailViews: { id: string; label: string; equipped: boolean }[] = [];
  private todayBestCache = 0;
  private questViews: QuestView[] = [];
  private skinViews: SkinView[] = [];
  private boostViews: BoostView[] = [];

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
  private lastEmoteAt = 0;
  private draftBanner = 0;
  /** Rival tracking: who beat you last time, for the revenge prompt. */
  private nemesis = "";
  private photoFinish = "";
  private prevBestDistance = 0;
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
  private trailFxAcc = 0;
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
    this.cups = new Tournaments(this.save.state.tournaments);
    this.pilotName = this.save.state.pilotName || loadPilotName(this.save.state.deviceId);
    this.save.state.pilotName = this.pilotName;
    if (this.cups.rollover()) this.save.persist();
    this.seed = this.today;

    host.classList.add("game-root");
    const canvas = document.createElement("canvas");
    canvas.className = "game-canvas";
    host.appendChild(canvas);

    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
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
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.dpr = this.preferredDpr();
    this.renderer.setPixelRatio(this.dpr);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x8ed0ee, 40, 220);

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
    this.massRace.addTo(this.scene);
    this.finishGate.addTo(this.scene);

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

    this.hud.onAction((action, id) => this.handleAction(action, id));
    this.onResize = () => this.resize();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    window.addEventListener("resize", this.onResize);
    this.onVis = () => {
      if (document.hidden) {
        this.hidden = true;
        if (this.state === "playing") this.setState("paused");
      } else {
        this.hidden = false;
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
    const raw = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.hidden) return;

    this.handleHotkeys();
    this.pumpNetwork(raw);
    this.dayTick(raw);
    this.adaptQuality(raw);
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
        speedMult: skin.speedMult,
        boost: this.boostTimer > 0 || this.powers.boostOn(),
        liftMult: this.powers.liftMult(),
        // Slipstream: tucking behind a rival genuinely reduces your drag.
        dragMult: this.powers.dragMult() * this.massRace.draftFor(this.bird.x, this.bird.y),
        feather: this.powers.featherOn(),
      },
      this.terrain,
    );

    if (this.bird.justLaunched) this.onLaunch();
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
      this.emitTrail(dt);
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
        const value = base * (this.save.state.gold ? 2 : 1) * this.powers.coinMult() * (this.mode.id === "coinrush" ? 2 : 1);
        this.runCoins += value;
        this.bonus += 4 * COIN_VALUE * value;
        this.awardXp(XP_RULES.coin);
        this.audio.ding(gem);
        this.particles.emitCollect(x, y);
        if (gem) {
          this.runGems += 1;
          this.particles.burstRing(x, y, 0x9ae8ff);
          this.hud.toast(`Sky gem +${value}`, "gold");
        }
        this.haptic(8);
      },
      onCloud: (kind, x, y) => this.onCloud(kind, x, y),
      onPickup: (kind, x, y) => this.onPickup(kind, x, y),
    });

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
      if (res.speed > 74) this.particles.emitSonicBoom(this.bird.x, this.bird.y);
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
    this.feverTimer = FEVER_DURATION + this.skin.feverBonus;
    if (!was) {
      this.audio.feverOn();
      this.audio.setMusicMode("fever");
      this.hud.toast("FEVER", "fever");
      this.flash("fever");
      this.particles.emitConfetti(this.bird.x, this.bird.y);
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
        for (let i = 0; i < 14; i++) this.particles.emitSparkle(this.bird.x, this.bird.y);
        this.audio.zenith();
        this.audio.duckMusic(0.6, 0.7);
        this.hud.toast(`ZENITH +${pts}`, "zenith");
        this.flash("perfect");
        this.haptic([60, 40, 80]);
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
    if (this.weather.inThermal && !this.input.diving) return "Riding the thermal!";
    if (this.terrain.isOcean(this.bird.x + 40) && !this.terrain.isOcean(this.bird.x)) return "Build speed — then RELEASE";
    return "";
  }

  private emitTrail(dt: number): void {
    this.trailFxAcc -= dt;
    if (this.trailFxAcc > 0) return;
    this.trailFxAcc = this.bird.speed() > 82 ? 0.028 : 0.055;
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
    if (this.bird.speed() > 68) this.particles.emitWingTrails(this.bird.x, this.bird.y, this.bird.speed());
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
    this.particles.update(visDt);
    this.camera.update(rawDt, this.bird, playing, this.terrain.heightAt(this.bird.x));

    this.applyWorldLook(this.bird.x, this.bird.altitude);
    this.terrain.update(this.bird.x);

    const dayT = Math.max(0, Math.min(1, this.daylight / this.daylightMax()));
    this.audio.update(rawDt, this.bird.speed(), diving, this.bird.grounded, this.feverOn, dayT, playing, this.weather.gust);

    const size = this.renderer.getSize(this.tmpSize);
    this.renderer.setViewport(0, 0, size.x, size.y);
    this.renderer.setScissorTest(false);
    this.renderer.render(this.scene, this.camera.camera);
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
      this.scene.fog.near = 40 + altT * 300;
      this.scene.fog.far = 220 + altT * 900;
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

  private startRun(): void {
    this.exitVersus();
    this.mode = modeById(this.modeId);
    this.resetRun(false);
    // Modes reshape the clock; Race has no sunset at all.
    this.daylight = this.mode.clock > 0 ? this.mode.clock : this.daylightMax();
    // Mass Race: build the 40-bird grid on the *same* seed so the field is
    // identical for anyone flying this race. Real players take over slots as
    // they join; unfilled slots keep flying as local squadron pilots.
    if (this.modeId === "massrace") {
      this.massRace.spawn(MASS_RACE_FIELD, `${this.seed}:${this.modeId}`, this.terrain, this.startX);
      this.raceField = MASS_RACE_FIELD + 1;
      this.racePlace = 0;
      this.raceFinishTime = 0;
      this.photoFinish = "";
      this.connectRace();
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
    const canAd = this.portalEnabled()
      ? Boolean(this.platform && this.platform.name !== "none")
      : !gold && this.ads.isAvailable() && this.save.adsLeftToday() > 0;
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

    const beatGhost = this.ghostRecorder.commit(this.seed, stats.distance);
    if (beatGhost) {
      this.hud.toast("New personal ghost recorded", "gold");
      this.telemetry.track("ghost_new", { distance: Math.round(stats.distance) });
    }

    // Global board + weekly cups both score off the same verified run stats.
    this.board.submit({
      deviceId: this.save.state.deviceId,
      name: this.pilotName,
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
    const score = this.score();
    // Captured before recording so the results screen can frame a new best
    // honestly (previous record vs this flight).
    this.prevBestDistance = this.save.state.bestDistance;
    this.save.recordRun(stats.distance, this.runCoins, score, this.today, this.island, this.terrain.biomeAt(this.bird.x).id);
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
    }
    this.skipInterstitialOnce = false;
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
    this.trailFxAcc = 0;
    this.atmosphereFxAcc = 0;
    this.magnetTimer = 0;
    this.shield = 0;
    this.boostTimer = 0;
    this.continueUsed = false;
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
        void navigator.clipboard?.writeText(this.roomCode).catch(() => undefined);
        this.hud.toast(`Room ${this.roomCode} copied — share it!`, "gold");
        this.modeId = "massrace";
        this.mode = modeById("massrace");
        this.startRun();
        break;
      }
      case "join-room": {
        const code = this.hud.readValue("roomCode").trim().toUpperCase().slice(0, 5);
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
      case "quick-match":
        this.roomCode = "";
        this.modeId = "massrace";
        this.mode = modeById("massrace");
        this.startRun();
        break;
      case "open-live":
        this.setScreen("live");
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
    }
    this.resetRun(true);
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

  /* ----------------------------------------------------------- checkout */

  private openCheckout(sku: Sku): void {
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
    else this.grantGold(source);
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
    return (this.save.state.gold ? DAYLIGHT_MAX_GOLD : DAYLIGHT_MAX) + this.skin.daylightBonus;
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
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    const maxDpr = isMobile ? 1.5 : 2;
    const dev = Math.min(window.devicePixelRatio || 1, maxDpr);
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

  /** Opens (or reuses) a realtime seat for the current race seed. */
  private connectRace(): void {
    if (!isMultiplayerConfigured()) return;
    if (!this.net) {
      this.net = new RealtimeClient(this.save.state.deviceId, this.pilotName, this.skin.id, 0.06);
      this.massRace.attachTransport(this.net);
    }
    this.net.setIdentity(this.pilotName, this.skin.id, 0.06);
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
    for (const e of net.drainEmotes()) this.massRace.showEmote(e.id, e.emote);
    if (this.state === "playing" && this.massRace.active) {
      net.send(this.bird.x, this.bird.y, this.bird.rotation, Math.max(0, this.bird.x - this.startX));
    }
  }

  private sendEmote(text: string): void {
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
    else if (s === "playing") this.audio.setMusicMode(this.feverOn ? "fever" : "play");
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

    const tiers = this.seasonPass.view();
    const prog = this.seasonPass.progressInTier();
    this.seasonView = {
      tier: this.seasonPass.tier(),
      maxTier: tiers.length,
      have: prog.have,
      need: prog.need,
      label: seasonLabel(seasonId()),
      tiers,
    };
    this.trophyViews = this.achievements.view();
    this.trophyCounts = this.achievements.counts();
    this.cupViews = this.cups.view();
    this.trailViews = this.cups.ownedTrails().map((id) => ({
      id,
      label: TRAILS[id]?.label ?? id,
      equipped: st.activeTrail === id,
    }));
    let todayBest = 0;
    for (const h of st.highScores) if (h.date === this.today && h.distance > todayBest) todayBest = h.distance;
    this.todayBestCache = todayBest;
    this.viewsVersion = this.uiVersion;
  }

  private pushHud(): void {
    if (this.viewsVersion !== this.uiVersion) this.refreshViews();
    const st = this.save.state;
    const stats = this.runStats();
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
      fever: this.feverOn ? this.feverTimer / (FEVER_DURATION + this.skin.feverBonus) : this.perfectChain / FEVER_NEED,
      feverOn: this.feverOn,
      multiplier: this.save.nestMultiplier() * (this.feverOn ? 2 : 1),
      bestDistance: st.bestDistance,
      prevBestDistance: this.state === "menu" ? st.bestDistance : this.prevBestDistance,
      firstRun: st.tutorialRuns < 2,
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
      adAvailable: this.portalEnabled() ? Boolean(this.platform && this.platform.name !== "none") : this.ads.isAvailable(),
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
      todayBest: this.todayBestCache,
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
      season: this.seasonView,
      trophies: this.trophyViews,
      trophyCounts: this.trophyCounts,
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
      cups: this.cupViews,
      trails: this.trailViews,
      lastPrize: this.lastPrize ? `${this.lastPrize.prize.icon} ${this.lastPrize.prize.label}` : "",
      standings:
        this.massRace.active && this.state === "playing"
          ? this.massRace.standings(this.bird.x, this.startX, this.pilotName, 6).rows
          : [],
      racePlace: this.racePlace,
      raceField: this.raceField,
      raceFinishTime: this.raceFinishTime,
      massRace: this.modeId === "massrace",
      multiplayerLive: isMultiplayerConfigured(),
      roster:
        this.massRace.active && this.state === "playing"
          ? this.massRace.roster(this.bird.x, this.startX, this.mode.finish, this.pilotName)
          : [],
      roomCode: this.net?.info().code ?? this.roomCode,
      roomCount: this.net?.info().count ?? 0,
      roomCapacity: this.net?.info().capacity ?? MASS_RACE_FIELD,
      netState: this.net?.info().state ?? "offline",
      netError: this.net?.info().error ?? "",
      draft: this.massRace.draft,
      finishRemaining: this.finishRemaining,
      nemesis: this.nemesis,
      photoFinish: this.photoFinish,
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
    if (this.p1 && this.p2) {
      const vertical = w / Math.max(1, h) >= 1.25;
      this.input.splitMode = this.versus ? (vertical ? "vertical" : "horizontal") : "off";
    }
  }
}
