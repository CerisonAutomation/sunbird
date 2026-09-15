/**
 * SUNBIRD platform adapter layer.
 *
 * The core game NEVER touches a portal SDK directly — it speaks this
 * interface. Adapters:
 *   • `CrazyGamesAdapter` — the full official CrazyGames SDK v3 surface
 *     (init, loading/gameplay lifecycle, ads, banners, data-module cloud
 *     save, user identity + system info, portal leaderboard, invites and
 *     instant multiplayer, account linking, IAP tokens, mute, pause/resume).
 *   • `PokiAdapter` — the Poki SDK surface this build targets.
 *   • `LocalAdapter`  — no-op platform + localStorage cloud save, so the
 *     save/identity flows run end-to-end in local dev and generic portals.
 *
 * Build targeting: `VITE_PORTAL_TARGET` = "crazy" | "poki" | "generic" |
 * "none". The SDK script URLs ship as inert literals (verified by
 * scripts/verify-portal.mjs); only the build target's URL is ever injected.
 */
import { CrazyGamesAdapter } from "./crazygames";
import { PokiAdapter } from "./poki";
import { LocalAdapter } from "./local";

export type PlatformName = "poki" | "crazy" | "generic" | "none";

/**
 * Portal events the game subscribes to at adapter init. `onPause`/`onResume`
 * fire on portal-side pause/resume (in addition to visibilitychange);
 * `onPortalMute` is the portal audio preference and must beat the in-game
 * toggle.
 */
export type PlatformEvents = {
  onAdOpened?: () => void;
  onAdClosed?: () => void;
  onPortalMute?: (muted: boolean) => void;
  onPause?: () => void;
  onResume?: () => void;
};

/** Portal identity (pseudonymous on CrazyGames; username + avatar). */
export type PlatformIdentity = {
  id: string;
  name: string;
  avatarUrl: string | null;
  countryCode: string | null;
  platform: PlatformName;
};

/** Canonical `user.systemInfo` shape, normalized to nullable fields. */
export type PlatformSystemInfo = {
  countryCode: string | null;
  locale: string | null;
  deviceType: "desktop" | "tablet" | "mobile" | null;
  osName: string | null;
  osVersion: string | null;
  browserName: string | null;
  browserVersion: string | null;
  applicationType: string | null;
};

/** Invite params passed via portal invite links (roomName, region, …). */
export type InviteParams = Record<string, string>;

/**
 * The STRICT platform surface. Every member is required — adapters that
 * don't support a capability implement an honest no-op (or a local
 * fallback, for the local adapter) and report it via `capabilities()`.
 */
export interface PlatformAdapter {
  readonly name: PlatformName;
  /** True once the SDK finished init (local adapter: immediately). */
  readonly ready: boolean;
  /** Which capabilities this adapter actually provides (telemetry/UI gating). */
  capabilities(): string[];

  /** Portal environment as reported by the SDK ("crazygames" | "local" | "disabled" | null). */
  environment(): string | null;

  /* ------------------------------------------------------- lifecycle */
  loadingStart(): void;
  loadingFinished(): void;
  /** Tell the portal the game is playable (canonical `game.signalGameReady`). */
  signalGameReady(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  /** Ask the portal to treat the game as paused (best-effort). */
  pause(): void;
  /** Portal celebration for a special moment (personal best). Never throws. */
  happytime(): void;

  /* -------------------------------------------------------------- ads */
  /** Midgame/commercial break. Resolves when the break is over or unavailable. */
  commercialBreak(): Promise<void>;
  /** Rewarded break. Resolves true only when the portal explicitly granted the reward. */
  rewardedBreak(): Promise<boolean>;
  showMidgameAd(): Promise<void>;
  showRewardedAd(): Promise<boolean>;
  mountBanner(container: HTMLElement): void;

  /* -------------------------------------------------------- cloud save */
  saveCloud<T>(key: string, value: T): Promise<void>;
  loadCloud<T>(key: string): Promise<T | null>;
  removeCloud(key: string): Promise<void>;
  clearCloud(): Promise<void>;
  hasCloud(key: string): Promise<boolean>;

  /* ---------------------------------------------------------- identity */
  /** Portal user, or null when signed out / unavailable. */
  getIdentity(): Promise<PlatformIdentity | null>;
  /** `user.systemInfo` (synchronous on the SDK; null fields when absent). */
  getSystemInfo(): PlatformSystemInfo;
  /** Portal leaderboard submission (`user.addScore`) — best-effort, never throws. */
  submitPlatformScore(score: number): Promise<void>;
  /** Account linking prompt (identity upgrade flow). True when completed. */
  requestAccountLink(): Promise<boolean>;
  /** IAP token (Xsolla user token, falling back to the generic user token). */
  getIapToken(): Promise<string | null>;

  /* ------------------------------------------------- invites / rooms */
  isInstantMultiplayer(): boolean;
  /** A specific invite-link parameter, or null. */
  getInviteParam(name: string): string | null;
  /** All invite params, or null when not launched from an invite. */
  getInviteParams(): InviteParams | null;
  /** Portal-initiated join (invite click while the game is open). Returns unregister. */
  onJoinRoom(listener: (params: InviteParams) => void): () => void;
  /**
   * Show the portal invite button/link for the current room.
   * Resolves with the shareable link, or null when unavailable.
   */
  inviteFriends(params: InviteParams): Promise<string | null>;
  /** Push room state to the portal (joinable flag, room id, invite params). */
  updateRoom(opts: { roomId?: string; isJoinable?: boolean; inviteParams?: InviteParams }): void;
  leftRoom(): void;
  /** Share via the portal (best-effort). True on success. */
  share(message: string): Promise<boolean>;

  /* --------------------------------------------------------- settings */
  /** Push the portal's current mute state into `PlatformEvents.onPortalMute`. */
  syncSettings(): void;
  isMuted(): boolean;
  /** Settings as exposed by the portal (disableChat etc.). */
  getSettings(): { muteAudio: boolean; disableChat: boolean };
}

/* ------------------------------------------------------------------ boot */

const TARGET = (import.meta.env.VITE_PORTAL_TARGET ?? "none").toLowerCase();
const CRAZY_BANNER_ID = import.meta.env.VITE_CRAZY_BANNER_ID ?? "";
// Both URLs ship as inert string literals in every bundle; only the build
// target's URL ever reaches the DOM (scriptFor() returns null for any other
// target), so a non-target SDK can never load — see scripts/verify-portal.mjs.
const POKI_SRC = "https://game-cdn.poki.com/scripts/v2/poki-sdk.js";
const CRAZY_SRC = "https://sdk.crazygames.com/crazygames-sdk-v3.js";
/** If the portal SDK can't load in this long, boot the game without it. */
const SDK_LOAD_TIMEOUT_MS = 6000;

export function portalTarget(): PlatformName {
  if (TARGET === "poki") return "poki";
  if (TARGET === "crazy" || TARGET === "crazygames") return "crazy";
  // "generic": portal-safe build for GameDistribution / Yandex / itch.io /
  // Newgrounds / GameMonetize etc. — no ads SDK, but ALL portal restrictions
  // apply (no external payments, no install prompt, no file downloads).
  if (TARGET === "generic") return "generic";
  return "none";
}

export function isPortalBuild(): boolean {
  return portalTarget() !== "none";
}

export { CRAZY_BANNER_ID };

/* ------------------------------------------------------------- SDK loading */

let loadPromise: Promise<PlatformName> | null = null;
let sdkBootPromise: Promise<{ name: PlatformName; crazyEnvironment: string | null }> | null = null;
/**
 * Forwards portal settings/pause events to the newest adapter's events. SDK
 * listeners are singletons (registered once at boot), but Game instances come
 * and go under StrictMode remounts — these refs always point at the live one.
 */
let portalEventSink: PlatformEvents | null = null;
let settingsListenerRegistered = false;
let pauseListenersRegistered = false;

function scriptFor(target: PlatformName): string | null {
  if (target === "poki") return POKI_SRC;
  if (target === "crazy") return CRAZY_SRC;
  return null; // "generic" and "none": no SDK script
}

function ensureSdk(target: PlatformName): Promise<PlatformName> {
  if (target === "none" || target === "generic") return Promise.resolve(target);
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve) => {
    const isReady = target === "poki" ? Boolean(window.PokiSDK) : Boolean(window.CrazyGames?.SDK);
    if (isReady) {
      resolve(target);
      return;
    }
    const src = scriptFor(target);
    if (!src) {
      resolve("none");
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[data-sunbird-sdk="${target}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve(target);
        return;
      }
      existing.addEventListener("load", () => resolve(target), { once: true });
      existing.addEventListener("error", () => resolve("none"), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.sunbirdSdk = target;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve(target);
    };
    script.onerror = () => resolve("none");
    document.head.appendChild(script);
  });
  return loadPromise;
}

/** Boot the portal SDK once; adapters stay per-Game so callbacks are fresh after remounts. */
function bootstrapSdk(target: PlatformName): Promise<{ name: PlatformName; crazyEnvironment: string | null }> {
  if (sdkBootPromise) return sdkBootPromise;
  // Hard cap: a hanging/blocked SDK script must never hold the game hostage.
  const timeout = new Promise<{ name: PlatformName; crazyEnvironment: string | null }>((resolve) => {
    window.setTimeout(() => resolve({ name: "none", crazyEnvironment: null }), SDK_LOAD_TIMEOUT_MS);
  });
  const boot = ensureSdk(target).then(async (loaded) => {
    if (loaded === "poki") {
      try {
        await window.PokiSDK?.init?.();
      } catch {
        // Poki's local sandbox can reject init; preserve a playable build.
      }
      return { name: "poki" as PlatformName, crazyEnvironment: null };
    }
    if (loaded === "crazy") {
      try {
        const sdk = window.CrazyGames?.SDK;
        await sdk?.init?.();
        sdk?.game?.loadingStart?.();
        const environment = typeof sdk?.environment === "string" ? sdk.environment : null;
        // Register the singleton settings + pause/resume listeners once.
        const game = sdk?.game;
        portalEventSink?.onPortalMute?.(game?.settings?.muteAudio === true);
        if (!settingsListenerRegistered && game?.addSettingsChangeListener) {
          settingsListenerRegistered = true;
          game.addSettingsChangeListener((s) => portalEventSink?.onPortalMute?.(s.muteAudio === true));
        }
        if (!pauseListenersRegistered && (game?.onPause || game?.onResume)) {
          pauseListenersRegistered = true;
          game.onPause?.(() => portalEventSink?.onPause?.());
          game.onResume?.(() => portalEventSink?.onResume?.());
        }
        return { name: "crazy" as PlatformName, crazyEnvironment: environment };
      } catch {
        // Graceful fallback also supports direct local preview.
        return { name: "none" as PlatformName, crazyEnvironment: null };
      }
    }
    return { name: loaded, crazyEnvironment: null };
  });
  sdkBootPromise = Promise.race([boot, timeout]);
  return sdkBootPromise;
}

/**
 * Initializes exactly one portal SDK script per build. The SDK core is a
 * singleton, while each Game instance gets a fresh event-bound adapter, so
 * React StrictMode re-mounts cannot leave stale audio/input callbacks behind.
 *
 * A "crazy" build that boots OUTSIDE the portal (environment "disabled", or
 * an unloaded SDK in local dev) falls back to the LocalAdapter so cloud
 * saves still work via localStorage and every other call is an honest no-op.
 */
export async function initPlatform(events: PlatformEvents): Promise<PlatformAdapter> {
  portalEventSink = events;
  const { name, crazyEnvironment } = await bootstrapSdk(portalTarget());
  if (name === "poki") {
    return new PokiAdapter(events);
  }
    if (name === "crazy") {
    if (crazyEnvironment === "disabled" || !window.CrazyGames?.SDK) {
      // Outside the portal: no ads/identity — a local adapter keeps saves
      // functional and every other call an honest no-op.
      return new LocalAdapter("none");
    }
    const adapter = new CrazyGamesAdapter(events, CRAZY_BANNER_ID);
    adapter.syncSettings();
    return adapter;
  }
  return new LocalAdapter(name === "generic" ? "generic" : "none");
}
