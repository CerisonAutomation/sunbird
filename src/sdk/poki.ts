/**
 * PokiAdapter — the canonical Poki HTML5 SDK surface, and nothing else.
 *
 * Every `PokiSDK.*` member this file touches comes from `./poki-canon`, whose
 * type is mapped from Poki's own published typings (`@poki/sdk@0.0.5`). That is
 * a deliberate constraint: the previous hand-written type let invented members
 * in (`signalGameReady`, `happytime`, `mute`/`isMuted`,
 * `hasAdBlock`/`setAdBlockActive`, `sendUserEvent`), and because each was
 * called through an optional chain they were silent no-ops in production rather
 * than type errors. Two of them are canonical on *CrazyGames*, which is how they
 * leaked across adapters.
 *
 * Wired here (T1 = official typings, T3 = integration guides):
 *   init({ submitScore }) · setDebug/setLogging (DEV) · enableEventTracking ·
 *   gameLoadingStart → gameLoadingFinished · gameplayStart/Stop ·
 *   commercialBreak · rewardedBreak({ size, onStart }) · getUser (optedIn
 *   respected) · getToken (1-minute backend-verification JWT) · login ·
 *   shareableURL · getURLParam · getLanguage · getDeviceInfo ·
 *   showLeaderboard · openExternalLink · captureError · movePill ·
 *   playtestSetCanvas · measure(category, what, action) · happyTime(0…1) ·
 *   isAdBlocked.
 *
<<<<<<< HEAD
 * Surfaces the SDK genuinely does not have are honest no-ops: there is no room
 * state, no portal pause hook, and no invite API, so those return null/false
 * rather than pretending. Two claims that used to sit in this comment were
 * wrong and are worth naming, because both cost compliance:
 *
 *   • "no in-SDK score submission" — `init({ submitScore })` IS Poki's
 *     leaderboard handshake, and `showLeaderboard()` is its overlay. Both are
 *     implemented below and wired to the end of a run.
 *   • "no banner API" — `displayAd()`/`destroyAd()` exist (see mountBanner).
 *
 * Cloud saves are handled by the SDK itself once a player is signed in, with a
 * 1 MB gamesave budget; `src/game/Storage.ts` keeps caches out of that sync
 * with the documented `poki_ignore` key prefix.
=======
 * Deliberately NOT wired, with the reason recorded per member in
 * `POKI_SDK_RUNTIME_ONLY`: gameLoadingProgress, gameInteractive, sendHighscore,
 * getLeaderboard, customEvent, logError, muteAd, roundStart/End, setPlayerAge,
 * generateScreenshot, displayAd/destroyAd.
 *
 * What Poki does not expose at all: banners, room state, pause hooks, a portal
 * mute preference, and a data module. Those are honest no-ops; cloud save uses
 * AUDS when a game id is configured and localStorage otherwise.
>>>>>>> origin/main
 */
import type {
  InviteParams,
  PlatformAdapter,
  PlatformEvents,
  PlatformIdentity,
  PlatformSystemInfo,
} from "./platform";
import { localCloudFallback } from "./local";
import { setLoadingNet } from "./net";
import { createAudsIfConfigured, AUDSPREFIX, PokiAuds } from "./auds";
import { clampHappyIntensity, sanitizeMeasure, type PokiSdk } from "./poki-canon";

<<<<<<< HEAD
type PokiUser = { username: string; avatarUrl?: string | null } | null;

/**
 * How long `commercialBreak()` / `rewardedBreak()` wait for the portal
 * SDK to settle before resolving on their own. Poki's documentation is
 * explicit that `commercialBreak(cb).then(() => { ... proceed ... })`
 * must always fire — including when Poki decides not to serve an ad —
 * so the game can never be wedged waiting on a promise that never
 * settles. Real breaks resolve well inside this window; the window
 * exists only so a broken or absent portal SDK cannot leave the player
 * on a dead screen with inert controls. The game's `AD_SAFETY_SECONDS`
 * valve remains a hard second layer of defense at the tick level.
 */
const BREAK_LOAD_TIMEOUT_MS = 30_000;

/**
 * Display-ad format for this game, or "" to leave the slot empty. Poki's
 * `displayAd(container, size)` needs a size the game cannot infer (the format
 * is chosen per game on the Poki side), so it is configuration, not code.
 */
const POKI_DISPLAY_AD_SIZE = (import.meta.env.VITE_POKI_DISPLAY_AD_SIZE as string | undefined)?.trim() ?? "";

=======
// The user shape comes from the official typings (`User`: username, avatarUrl,
// optedIn) — redeclaring it locally is how `optedIn` went unnoticed.
>>>>>>> origin/main
type PokiShareableData = Record<string, string | number | boolean>;

/*
 * The SDK type is imported from ./poki-canon (mapped from @poki/sdk@0.0.5 plus
 * the runtime-only members the live CDN build assigns). Declaring it locally is
 * what allowed non-canonical names to compile, so it no longer lives here.
 */
<<<<<<< HEAD
type PokiSdk = {
  init?: (options?: PokiInitOptions) => Promise<void>;
  setDebug?: (on: boolean) => void;
  setLogging?: (on: boolean) => void;
  enableEventTracking?: () => void;
  /**
   * Marks the start of the loading phase. Poki's loading pipeline is
   * `gameLoadingStart()` → (assets load) → `gameLoadingFinished()`; calling
   * only the finished side mis-handles the portal's loading screen.
   */
  gameLoadingStart?: () => void;
  gameLoadingFinished?: () => void;
  gameplayStart?: () => void;
  gameplayStop?: () => void;
  /**
   * Poki's milestone celebration overlay. NOTE the capital T: the SDK exposes
   * `happyTime`, and this file previously called `happytime()`, which does not
   * exist on it — so the overlay (and its analytics) never fired once. Verified
   * against the live SDK: `typeof PokiSDK.happytime === "undefined"`.
   */
  happyTime?: () => Promise<void>;
  commercialBreak?: (onStart?: () => void) => Promise<void>;
  rewardedBreak?: (onStart?: (() => void) | { onStart?: () => void; size?: "small" | "medium" | "large" }) => Promise<boolean>;

  /** Gamebar display ad rendered into a container the game owns. */
  displayAd?: (
    container: HTMLElement,
    size: string,
    onCanDestroy?: () => void,
    onDisplayRendered?: (isEmpty: boolean) => void,
  ) => void;
  destroyAd?: (container?: HTMLElement) => void;
  /** Celebratory overlay (personal best, level complete). */
  /** Mute / unmute gameplay audio on portal request. */
  mute?: (muted?: boolean) => void;
  /** Detect ad blockers so the game can avoid gating content behind ads. */
  /**
   * The SDK's own ad-block report. Named `isAdBlocked` on the live SDK; the
   * `hasAdBlock` this used to call does not exist, so the probe always answered
   * "no" and the short-circuit it exists for could never fire.
   */
  isAdBlocked?: () => boolean;
  /** Language tag for the current player (e.g. "en", "es-MX"). */
  getLanguage?: () => string;
  /** Device class as the portal sees it — tablets report "tablet", not "mobile". */
  getDeviceInfo?: () => { category: "mobile" | "tablet" | "desktop" } | null;
  getUser?: () => Promise<PokiUser>;
  /** Short-lived JWT for backend verification (expires in 1 minute). */
  getToken?: () => Promise<string | null>;
  login?: () => Promise<void>;
  /** Signed shareable URL carrying the given game data. */
  shareableURL?: (data: PokiShareableData) => Promise<string>;
  /** Read a parameter from the page query string (portal share deep-links). */
  getURLParam?: (key: string) => string | null;
  /** Poki's own leaderboard overlay. `null`/`false` closes it. */
  showLeaderboard?: (id?: number | null | false) => void;
  /** Report a runtime error to the portal's error dashboard. */
  captureError?: (err: string | Error) => void;
  /** Game-events measurement: `measure("level", "1", "start")`. */
  measure?: (category: string, label: string, action: string) => void;
  /** Reposition the mobile Poki Pill: (0–50)% from top + px offset. */
  movePill?: (topPercent: number, topPx: number) => void;
  /** Tracking events for custom analytics. */
  sendUserEvent?: (name: string, params?: Record<string, unknown>) => void;
  /** Any external navigation MUST go through this, never `location.href`. */
  openExternalLink?: (url: string) => void;
  /**
   * Register the gameplay canvas with the playtest recorder. Without this the
   * Level-2 playtest recordings have nothing to capture.
   */
  playtestSetCanvas?: (canvas: HTMLCanvasElement | HTMLCanvasElement[] | null) => void;
  playtestCaptureHtmlOnce?: () => void;
  playtestCaptureHtmlForce?: () => void;
  playtestCaptureHtmlOn?: () => void;
  playtestCaptureHtmlOff?: () => void;
};
=======
>>>>>>> origin/main

/**
 * `init({ submitScore })` is Poki's leaderboard handshake: the SDK hands us a
 * submit function, which we then call per leaderboard name. Kept optional —
 * older CDN builds init with no arguments.
 */
type PokiInitOptions = {
  debug?: boolean;
  logging?: boolean;
  submitScore?: (submit: (leaderboard: string, score: number) => void) => void;
};

/**
 * Leaderboard the run score is submitted to. The name must match the board as
 * it is configured in Poki for Developers; `VITE_POKI_LEADERBOARD` lets a
 * build be re-pointed at a renamed board without a code change, and the
 * default stays the one the game has always submitted to.
 */
const POKI_LEADERBOARD = (import.meta.env.VITE_POKI_LEADERBOARD as string | undefined)?.trim() || "distance";

/**
 * The submit function Poki hands us during `init({ submitScore })`. Held at
 * module scope because init runs on the boot path (sdk/platform.ts) long
 * before the adapter is constructed.
 */
let scoreSubmit: ((leaderboard: string, score: number) => void) | null = null;

/** Options for the boot path's `PokiSDK.init()` — the leaderboard handshake. */
export function pokiInitOptions(): PokiInitOptions {
  return {
    ...(import.meta.env.DEV ? { debug: true, logging: true } : {}),
    submitScore: (submit) => {
      scoreSubmit = typeof submit === "function" ? submit : null;
    },
  };
}

/** True once the SDK has handed over its score submitter. */
export function pokiLeaderboardReady(): boolean {
  return scoreSubmit !== null;
}

/** Submit one score to a Poki leaderboard. False when unavailable. */
export function pokiSubmitScore(score: number, leaderboard: string = POKI_LEADERBOARD): boolean {
  if (!scoreSubmit || !Number.isFinite(score)) return false;
  try {
    scoreSubmit(leaderboard, Math.round(score));
    return true;
  } catch {
    return false;
  }
}

declare global {
  interface Window {
    PokiSDK?: PokiSdk;
  }
}

const EMPTY_INFO: PlatformSystemInfo = {
  countryCode: null,
  locale: null,
  deviceType: null,
  osName: null,
  osVersion: null,
  browserName: null,
  browserVersion: null,
  applicationType: null,
};

/** Dismissed share sheet = the surface was shown; report it as handled. */
function shareDismissed(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "AbortError" || error.name === "NotAllowedError");
}

/**
 * Last-resort loading-screen release, registered into the shared net
 * (sdk/net.ts). This is the ONLY place in the codebase that may call the raw
 * `PokiSDK` global behind the adapter's back, and it only ever runs when no
 * adapter was constructed — i.e. nothing has signalled the portal yet. On a
 * healthy boot the adapter owns both markers, one-shot, and this never fires.
 */
setLoadingNet(() => {
  const sdk = (window as unknown as { PokiSDK?: PokiSdk }).PokiSDK;
<<<<<<< HEAD
  // `gameLoadingFinished` is the documented release; there is no
  // `signalGameReady` on Poki, and asking for one hid the real call in noise.
=======
  // gameLoadingFinished() is the documented conversion-to-play marker; the
  // failsafe fires it exactly once. (`gameInteractive` also exists in the CDN
  // build but is the legacy marker — see POKI_SDK_RUNTIME_ONLY.)
>>>>>>> origin/main
  sdk?.gameLoadingFinished?.();
});

export class PokiAdapter implements PlatformAdapter {
  readonly name = "poki" as const;
  readonly ready = true;
  /** Container currently holding a display ad, so it can be torn down. */
  private banner: HTMLElement | null = null;

  /** AUDS client — non-null only when VITE_POKI_GAME_ID is configured. */
  private readonly auds: PokiAuds | null = createAudsIfConfigured();

  constructor(private readonly events: PlatformEvents) {}

  private get sdk(): PokiSdk | undefined {
    return window.PokiSDK;
  }

  capabilities(): string[] {
    const caps = ["lifecycle", "cloudSaveLocal", "identity", "iap", "urlParams", "share", "measure"];
    // Canonical locale source: getLanguage() reads Poki's `iso_lang` URL param
    // and falls back to navigator.language, then reduces to the base tag.
    if (typeof this.sdk?.getLanguage === "function") caps.push("language");
    if (typeof this.sdk?.happyTime === "function") caps.push("celebration");
    // "ads" is reported from the live SDK, not from the build target. Off the
    // Poki CDN (local preview, CDN blocked, SDK rejected) there is no ad
    // surface at all, and the game must not offer breaks or rewarded buttons
    // that can only fail — it offers the coin/gold paths instead.
    if (typeof this.sdk?.commercialBreak === "function" || typeof this.sdk?.rewardedBreak === "function") {
      caps.push("ads");
    }
    // Reported from what the deployed SDK actually exposes, so the UI never
    // offers a portal surface that isn't there.
    if (typeof this.sdk?.showLeaderboard === "function" || pokiLeaderboardReady()) caps.push("leaderboard");
    if (typeof this.sdk?.playtestSetCanvas === "function") caps.push("playtestCanvas");
    if (typeof this.sdk?.openExternalLink === "function") caps.push("externalLink");
    if (typeof this.sdk?.getDeviceInfo === "function") caps.push("deviceInfo");
    return caps;
  }

  /**
   * Poki's own view of the player's language. The guide is explicit that the
   * best experience is to serve the player's language automatically, and Poki
   * knows the account/region language better than `navigator.language` does.
   * Returns null when the SDK is absent, so the caller keeps its browser
   * detection.
   */
  getLanguage(): string | null {
    try {
      const lang = this.sdk?.getLanguage?.();
      return typeof lang === "string" && lang.length > 0 ? lang : null;
    } catch {
      return null;
    }
  }

  /**
   * Keep the mobile Poki pill clear of the HUD. The default is (0, 24); our
   * daylight meter and mute/pause buttons live in that band, so the pill is
   * pushed below the top-left cluster on small screens.
   */
  movePill(topPercent: number, topPx: number): void {
    try {
      this.sdk?.movePill?.(topPercent, topPx);
    } catch {
      /* pill positioning is cosmetic — never fatal */
    }
  }

  /**
   * Level-2 Playtest recordings need the canvas registered and HTML capture
   * switched on (Poki game-dev-tools). Both are no-ops off the portal.
   */
  playtestCapture(on: boolean): void {
    try {
      if (on) this.sdk?.playtestCaptureHtmlOn?.();
      else this.sdk?.playtestCaptureHtmlOff?.();
    } catch {
      /* capture is best-effort */
    }
  }

  environment(): string | null {
    return null;
  }

  /* lifecycle */
  loadingStart(): void {
    // Poki marks the loading phase with gameLoadingStart(). bootstrapSdk()
    // already fired it right after init (before the game's asset work), so
    // this delegate exists for interface symmetry — re-sending a phase
    // marker is harmless.
    this.sdk?.gameLoadingStart?.();
  }

  private loadingFinishedSent = false;

  loadingFinished(): void {
    // Phase markers are one-shot: Poki's "no consecutive duplicates" rule
    // (enforced by the Inspector) is applied to the loading signal too.
    if (this.loadingFinishedSent) return;
    this.loadingFinishedSent = true;
    this.sdk?.gameLoadingFinished?.();
  }

  /**
   * The interface name comes from CrazyGames (`game.signalGameReady`). Poki has
   * no such method: the canonical "the player can play now" signal is
   * `gameLoadingFinished()`, so this delegates to it (one-shot) instead of
   * calling a member that would never exist.
   */
  signalGameReady(): void {
    // Poki has no `signalGameReady`; `gameLoadingFinished` is the release the
    // platform documents, and it is one-shot.
    this.loadingFinished();
  }

  /**
   * Poki's hard lifecycle rule: `gameplayStart()` must never follow another
   * `gameplayStart()`, and the same for stop — the Inspector's Event Log flags
   * consecutive duplicates, and its dashboard derives session length from the
   * alternation.
   *
   * The primary guard is `GameplayEventSink` in the game, which every phase
   * emission funnels through. This is the backstop at the boundary the portal
   * actually observes, so that no *future* call path — a late SDK landing, a
   * visibility handler, a defensive resend around a break — can emit a duplicate
   * the sink never saw. A stop before any start is dropped for the same reason:
   * the portal cannot stop a session it was never told began.
   */
  private gameplayRunning = false;

  gameplayStart(): void {
    if (this.gameplayRunning) return;
    this.gameplayRunning = true;
    this.sdk?.gameplayStart?.();
  }

  gameplayStop(): void {
    if (!this.gameplayRunning) return;
    this.gameplayRunning = false;
    this.sdk?.gameplayStop?.();
  }

  /** Test/inspection helper: has the portal been told gameplay is running? */
  get gameplayIsRunning(): boolean {
    return this.gameplayRunning;
  }

  pause(): void {
    /* no portal pause hook on Poki — visibility handling covers it. */
  }

<<<<<<< HEAD
  happyTime(): void {
    // PokiSDK.happyTime() triggers a celebratory confetti overlay for
    // personal bests and other milestone moments. Fire-and-forget so it
    // never blocks gameplay even when the SDK is unavailable in an
    // off-portal preview.
    try {
      void this.sdk?.happyTime?.();
=======
  /**
   * `PokiSDK.happyTime(intensity)` — intensity is 0…1 (Defold guide:
   * "value is between 0 and 1"). The adapter previously called `happytime()`,
   * which is CrazyGames' spelling: on Poki the optional chain resolved to
   * undefined and **no celebration ever reached the portal**. Fire-and-forget,
   * clamped, and never throws — the game runs its own confetti regardless.
   */
  happyTime(intensity: number): void {
    try {
      this.sdk?.happyTime?.(clampHappyIntensity(intensity));
>>>>>>> origin/main
    } catch {
      /* celebrate locally — the game already emits its own confetti */
    }
  }

  /* ads */
  async commercialBreak(): Promise<void> {
    const sdk = this.sdk;
    if (!sdk?.commercialBreak) return;
    let opened = false;
    try {
      // Exactly the documented shape: the callback pauses audio and input, and
      // the promise settles when the platform says the break is over. Nothing
      // here may end it earlier — the game's `AD_SAFETY_SECONDS` valve at
      // the tick level is the hard second layer; this race is the first.
      // The Poki docs are explicit: `PokiSDK.commercialBreak(cb).then(() => {
      // ... proceed with gameplay })` — the `.then()` must always fire,
      // including when Poki decides not to serve an ad. If the SDK promise
      // never settles (a broken or blocked CDN, an Inspector with no ad
      // service behind it), this race wins and the break resolves as declined
      // rather than trapping the game forever.
      await Promise.race([
        sdk.commercialBreak(() => {
          opened = true;
          this.events.onAdOpened?.();
        }),
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, BREAK_LOAD_TIMEOUT_MS);
        }),
      ]);
    } catch {
      // The portal decides whether an ad is available. A rejected opportunity
      // is not a game error and must never block a restart.
    } finally {
      if (opened) this.events.onAdClosed?.();
    }
  }

  async rewardedBreak(): Promise<boolean> {
    const sdk = this.sdk;
    if (!sdk?.rewardedBreak) return false;
    let opened = false;
    try {
      // Documented shape again: the SDK's own verdict decides the reward, and a
      // declined or failed break resolves false rather than throwing.
      // Same timeout as commercialBreak — a rewarded break that never
      // settles must still let the player continue, just without coins.
      const rewarded = await Promise.race([
        sdk.rewardedBreak(() => {
          opened = true;
          this.events.onAdOpened?.();
        }),
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, BREAK_LOAD_TIMEOUT_MS);
        }),
      ]);
      return Boolean(rewarded);
    } catch {
      return false;
    } finally {
      if (opened) this.events.onAdClosed?.();
    }
  }

  async showMidgameAd(): Promise<void> {
    await this.commercialBreak();
  }

  async showRewardedAd(): Promise<boolean> {
    return this.rewardedBreak();
  }

  /**
   * In-game display ads (`PokiSDK.displayAd`).
   *
   * The comment here used to claim Poki exposes no banner API at all — the
   * documented SDK has `displayAd(container, size)` / `destroyAd(container)`,
   * and the guide notes that portrait games additionally earn from Gamebar
   * Display ads with no code. A size is therefore a per-game decision rather
   * than something the game can guess, so the slot is filled only when a size
   * is configured (`VITE_POKI_DISPLAY_AD_SIZE`); otherwise the container stays
   * empty and nothing is requested.
   */
  mountBanner(container: HTMLElement): void {
    const size = POKI_DISPLAY_AD_SIZE;
    if (!this.sdk?.displayAd || !size) return;
    this.banner = container;
    try {
      this.sdk.displayAd(
        container,
        size,
        undefined,
        (isEmpty) => {
          // An empty creative (no fill, or an ad blocker) must leave no hole in
          // the layout; the container is collapsed rather than showing a box.
          container.classList.toggle("ad-empty", isEmpty);
        },
      );
    } catch {
      /* a failed display ad is not a game error */
    }
  }

  destroyBanner(): void {
    const container = this.banner;
    if (!container || !this.sdk?.destroyAd) return;
    this.banner = null;
    try {
      this.sdk.destroyAd(container);
    } catch {
      /* best effort */
    }
  }

  /** Cache the Poki user id after first resolution so we don't await on every save. */
  private _cachedAudsUserId: string | null | undefined = undefined;
  private async _audsUserId(): Promise<string | null> {
    if (this._cachedAudsUserId !== undefined) return this._cachedAudsUserId;
    try {
      const u = await this.sdk?.getUser?.();
      this._cachedAudsUserId = u?.username ?? null;
    } catch {
      this._cachedAudsUserId = null;
    }
    return this._cachedAudsUserId;
  }

  /** Cached ad-block detection result (probed once, resolved at most once). */
  private adBlockProbed = false;
  private cachedAdBlock = false;

  /**
   * `PokiSDK.isAdBlocked()` is the canonical probe (the invented
   * `hasAdBlock`/`setAdBlockActive` pair does not exist in any Poki build, so
   * the old probe always read false). The loader stub answers `{}` while the
   * core decides, so every shape is handled: boolean, promise, or junk.
   *
   * Detection never gates content — Poki's policy forbids that — it only lets
   * ad opportunities short-circuit instead of hanging.
   */
  private probeAdBlock(): void {
    if (this.adBlockProbed) return;
    this.adBlockProbed = true;
    try {
<<<<<<< HEAD
      if (this.sdk?.isAdBlocked) this.cachedAdBlock = Boolean(this.sdk.isAdBlocked());
=======
      const result = this.sdk?.isAdBlocked?.();
      if (typeof result === "boolean") this.cachedAdBlock = result;
      else if (result instanceof Promise) {
        void result
          .then((v) => { this.cachedAdBlock = typeof v === "boolean" ? v : false; })
          .catch(() => { this.cachedAdBlock = false; });
      }
>>>>>>> origin/main
    } catch { /* ignore */ }
  }

  /* cloud save — AUDS when game id configured, localStorage fallback otherwise */
  async saveCloud<T>(key: string, value: T): Promise<void> {
    if (this.auds) {
      try {
        const userId = await this._audsUserId();
        const existingId = PokiAuds.readSingletonId(AUDSPREFIX.settings, userId ?? undefined);
        const slot = await this.auds.putSingleton(
          AUDSPREFIX.settings,
          { key },
          { key, value: JSON.stringify(value) },
          { existingId, userId: userId ?? undefined },
        );
        if (slot) return;
      } catch { /* fall through to local */ }
    }
    return localCloudFallback.save(key, value);
  }

  async loadCloud<T>(key: string): Promise<T | null> {
    if (this.auds) {
      try {
        const userId = await this._audsUserId();
        const id = PokiAuds.readSingletonId(AUDSPREFIX.settings, userId ?? undefined);
        if (id) {
          const entry = await this.auds.fetchById(AUDSPREFIX.settings, id);
          if (entry?.data) {
            const raw = (entry.data as Record<string, unknown>)["value"];
            if (typeof raw === "string") return JSON.parse(raw) as T;
          }
        }
      } catch { /* fall through to local */ }
    }
    return localCloudFallback.load<T>(key);
  }

  removeCloud(key: string): Promise<void> {
    return localCloudFallback.remove(key);
  }
  clearCloud(): Promise<void> {
    return localCloudFallback.clear();
  }
  hasCloud(key: string): Promise<boolean> {
    return localCloudFallback.has(key);
  }

  /* identity / portal leaderboard / IAP */
  async getIdentity(): Promise<PlatformIdentity | null> {
    const sdk = this.sdk;
    if (!sdk?.getUser) return null;
    try {
      const u = await sdk.getUser();
      if (!u || !u.username) return null;
      // `optedIn` is part of the official User shape: a player who has not
      // opted in must not be surfaced as an identity anywhere in the game.
      if (u.optedIn === false) return null;
      return {
        id: u.username,
        name: u.username,
        avatarUrl: typeof u.avatarUrl === "string" && u.avatarUrl ? u.avatarUrl : null,
        countryCode: null,
        platform: "poki",
      };
    } catch {
      return null; // user accounts unavailable or user opted out
    }
  }

  getSystemInfo(): PlatformSystemInfo {
    // Poki exposes locale via getLanguage() but does not expose device/OS
    // descriptors to the game (the portal abstracts them). Provide what we
    // can detect locally, leave the rest null.
    const locale = (() => {
      try { return this.sdk?.getLanguage?.() ?? navigator.language ?? null; } catch { return null; }
    })();
    const deviceType: PlatformSystemInfo["deviceType"] = (() => {
      try {
        const coarse = window.matchMedia?.("(pointer: coarse)")?.matches;
        const narrow = window.innerWidth < 700;
        const ipad = /Macintosh/i.test(navigator.userAgent) && coarse;
        const tablet = /iPad|Android(?!.*Mobile)/i.test(navigator.userAgent) || ipad;
        if (tablet) return "tablet";
        if (coarse || narrow || /Mobi|Android|iPhone|iPod/i.test(navigator.userAgent)) return "mobile";
        return "desktop";
      } catch { return null; }
    })();
    return { ...EMPTY_INFO, locale, deviceType };
  }

  async submitPlatformScore(score: number): Promise<void> {
    // Poki's own leaderboards: the SDK handed us a submitter during
    // init({ submitScore }). Best-effort — the in-game board (AUDS) is the
    // authoritative surface, so a missing handle is not an error.
    pokiSubmitScore(score);
  }

  /* ------------------------------------------- Poki-native UI & diagnostics */

  /** Poki's own leaderboard overlay (`PokiSDK.showLeaderboard`). */
  showLeaderboard(id?: number | null): void {
    try {
      this.sdk?.showLeaderboard?.(id ?? null);
    } catch { /* never break the menu over a portal overlay */ }
  }

  /** Register the gameplay canvas so playtest recordings capture the game. */
  playtestSetCanvas(canvas: HTMLCanvasElement | HTMLCanvasElement[] | null): void {
    try {
      this.sdk?.playtestSetCanvas?.(canvas);
    } catch { /* recorder optional */ }
  }


  /**
   * Canonical locale source: `PokiSDK.getLanguage()` returns the base tag of
   * Poki's `iso_lang` URL param, or `navigator.language` when absent. The game
   * prefers this over its own sniffing on a portal build, so a player who set a
   * language on poki.com gets it in-game.
   */
  portalLanguage(): string | null {
    try {
      const value = this.sdk?.getLanguage?.();
      return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
    } catch {
      return null;
    }
  }

  /**
   * Reposition the Poki Pill on mobile: `movePill(topPercent, topPx)`, where
   * topPercent is 0–50 and topPx is an extra offset (default `movePill(0, 24)`).
   * Exposed so the HUD can keep the pill off its own controls once a device
   * check says they collide; it is not called speculatively.
   */
  movePill(topPercent: number, topPx: number): void {
    try {
      this.sdk?.movePill?.(
        Math.min(50, Math.max(0, Number.isFinite(topPercent) ? topPercent : 0)),
        Number.isFinite(topPx) ? topPx : 0,
      );
    } catch { /* cosmetic only */ }
  }

  /** Device class as the portal sees it (tablets are "tablet", not "mobile"). */
  deviceCategory(): "mobile" | "tablet" | "desktop" | null {
    try {
      return this.sdk?.getDeviceInfo?.()?.category ?? null;
    } catch {
      return null;
    }
  }

  /** External navigation must go through the portal, never `location.href`. */
  openExternalLink(url: string): void {
    try {
      this.sdk?.openExternalLink?.(url);
    } catch { /* no external links are shipped today; stay inert */ }
  }

  /**
   * Poki's account upgrade prompt (`PokiSDK.login()` — "Poki User Accounts").
   * It used to return false unconditionally on the assumption that Poki had no
   * such prompt; the documented SDK surface has one, so this now actually asks
   * and reports whether a player ended up signed in.
   */
  async requestAccountLink(): Promise<boolean> {
    const sdk = this.sdk;
    if (!sdk?.login) return false;
    try {
      await sdk.login();
      const user = await sdk.getUser?.();
      return Boolean(user && user.username);
    } catch {
      // Declining the prompt rejects in some SDK versions; that is a choice,
      // not an error.
      return false;
    }
  }

  async getIapToken(): Promise<string | null> {
    const sdk = this.sdk;
    if (!sdk?.getToken) return null;
    try {
      const token = await sdk.getToken();
      return typeof token === "string" && token ? token : null;
    } catch {
      return null;
    }
  }

  /* invites / rooms / share */
  isInstantMultiplayer(): boolean {
    return false;
  }

  getInviteParam(name: string): string | null {
    const sdk = this.sdk;
    if (!sdk?.getURLParam) return null;
    try {
      const value = sdk.getURLParam(name);
      return typeof value === "string" && value ? value : null;
    } catch {
      return null;
    }
  }

  getInviteParams(): InviteParams | null {
    return null;
  }

  onJoinRoom(_listener: (params: InviteParams) => void): () => void {
    return () => undefined;
  }

  async inviteFriends(_params: InviteParams): Promise<string | null> {
    return null;
  }

  updateRoom(_opts: { roomId?: string; isJoinable?: boolean; inviteParams?: InviteParams }): void {
    /* no portal room state on Poki */
  }

  leftRoom(): void {
    /* no portal room state on Poki */
  }

  /**
   * Portal-native share: ask the SDK for a signed shareable URL carrying the
   * share params (each key is prefixed `gd` on poki.com and readable again
   * with `getURLParam`), then hand URL + message to the Web Share API
   * (clipboard fallback when the sheet is unavailable).
   */
  async share(message: string, params?: InviteParams): Promise<boolean> {
    let url: string | null = null;
    const sdk = this.sdk;
    if (sdk?.shareableURL) {
      try {
        const data: PokiShareableData = { id: "sunbird" };
        for (const [key, value] of Object.entries(params ?? {})) {
          data[key] = value.slice(0, 64);
        }
        const built = await sdk.shareableURL(data);
        if (typeof built === "string" && built) url = built;
      } catch {
        /* fall through to a plain share */
      }
    }
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Sunbird", text: message, url: url ?? undefined });
        return true;
      } catch (error) {
        return shareDismissed(error);
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url ?? message);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Game Events: `PokiSDK.measure(category, what, action)` — the official
   * signature (the second parameter is `what`, not `label`).
   *
   * Arguments go through `sanitizeMeasure`, which enforces the three rules the
   * live SDK enforces: category+what required, no `/` or `^`, and at most two
   * numeric values across all three. An event that violates them is dropped by
   * Poki with only a console error, so rejecting it here keeps the funnel honest
   * (and `import.meta.env.DEV` surfaces the mistake to us instead, through
   * `console.debug` — the one channel the production gate allows, since
   * `console.warn` would ship a red line into every player's console).
   */
  measure(category: string, what: string, action: string): void {
    const clean = sanitizeMeasure(category, what, action);
    if (!clean) {
      if (import.meta.env.DEV) {
        console.debug(`[poki] measure() dropped — invalid (${category}, ${what}, ${action})`);
      }
      return;
    }
    try {
      this.sdk?.measure?.(clean.category, clean.what, clean.action);
    } catch {
      /* measurement must never break gameplay */
    }
  }

  /* ad-block state */
  hasAdBlock(): boolean {
    this.probeAdBlock();
    return this.cachedAdBlock;
  }

  /* settings */
  /**
   * Poki exposes **no** mute preference and no settings-change event — the
   * invented `isMuted()`/`mute()`/`setAdBlockActive()` calls here never
   * resolved, so `onPortalMute` never fired and the code only looked like it
   * honoured a portal setting. Audio during breaks is handled where Poki
   * documents it: the game mutes itself around `commercialBreak`/`rewardedBreak`
   * (Game.beginPortalAd/endPortalAd). All that is left to probe is ad-block.
   */
  syncSettings(): void {
<<<<<<< HEAD
    // Poki exposes no "is the site muted" API — its volume controls are for ads,
    // not for the player's preference — so the game's own mute setting is the
    // single source of truth and there is nothing to poll. The ad-block probe is
    // still worth taking once at boot, because it is what stops a break being
    // requested that could never serve (MON-12).
    this.probeAdBlock();
=======
    this.probeAdBlock();
  }
  isMuted(): boolean {
    return false;
>>>>>>> origin/main
  }

  getSettings(): { muteAudio: boolean; disableChat: boolean } {
    return { muteAudio: false, disableChat: false };
  }

  /* error reporting */
  captureError(err: string | Error): void {
    const sdk = this.sdk;
    if (!sdk?.captureError) return;
    try {
      sdk.captureError(err);
    } catch {
      /* Poki error capture is best-effort */
    }
  }
}
