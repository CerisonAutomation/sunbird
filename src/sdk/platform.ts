export type PlatformName = "poki" | "crazy" | "generic" | "none";

export type PlatformEvents = {
  onAdOpened?: () => void;
  onAdClosed?: () => void;
  /** Portal-level mute (CrazyGames `muteAudio`) — must beat the in-game toggle. */
  onPortalMute?: (muted: boolean) => void;
};

export interface PlatformAdapter {
  readonly name: PlatformName;
  gameplayStart(): void;
  gameplayStop(): void;
  loadingFinished(): void;
  /** Portal celebration (CrazyGames `happytime`) — best-effort, never throws. */
  happytime(): void;
  /** Re-apply portal settings (mute) to the current events — safe to repeat. */
  syncSettings(): void;
  commercialBreak(): Promise<void>;
  rewardedBreak(): Promise<boolean>;
  mountBanner(container: HTMLElement): void;
}

type PokiSdk = {
  init?: () => Promise<void>;
  gameplayStart?: () => void;
  gameplayStop?: () => void;
  gameLoadingFinished?: () => void;
  commercialBreak?: (onStart?: () => void) => Promise<void>;
  rewardedBreak?: (onStart?: () => void) => Promise<boolean>;
};

type CrazyAdCallbacks = {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (error?: unknown, data?: unknown) => void;
};

type CrazySdk = {
  init?: () => Promise<void> | void;
  game?: {
    loadingStart?: () => void;
    loadingStop?: () => void;
    gameplayStart?: () => void;
    gameplayStop?: () => void;
    happytime?: () => Promise<void> | void;
    settings?: { muteAudio?: boolean; disableChat?: boolean };
    addSettingsChangeListener?: (listener: (settings: { muteAudio?: boolean }) => void) => void;
    removeSettingsChangeListener?: (listener: (settings: { muteAudio?: boolean }) => void) => void;
  };
  ad?: { requestAd?: (kind: "midgame" | "rewarded", callbacks: CrazyAdCallbacks) => void };
  banner?: { requestBanner?: (opts: { id: string; width: number; height: number }) => Promise<HTMLElement> };
};

declare global {
  interface Window {
    PokiSDK?: PokiSdk;
    CrazyGames?: { SDK?: CrazySdk };
  }
}

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

class NullAdapter implements PlatformAdapter {
  readonly name = "none" as const;
  gameplayStart(): void {}
  gameplayStop(): void {}
  loadingFinished(): void {}
  happytime(): void {}
  syncSettings(): void {}
  async commercialBreak(): Promise<void> {}
  async rewardedBreak(): Promise<boolean> {
    return false;
  }
  mountBanner(_container: HTMLElement): void {}
}

class PokiAdapter implements PlatformAdapter {
  readonly name = "poki" as const;
  constructor(private readonly events: PlatformEvents) {}

  private get sdk(): PokiSdk | undefined {
    return window.PokiSDK;
  }

  gameplayStart(): void {
    this.sdk?.gameplayStart?.();
  }

  gameplayStop(): void {
    this.sdk?.gameplayStop?.();
  }

  loadingFinished(): void {
    this.sdk?.gameLoadingFinished?.();
  }

  happytime(): void {
    // Poki has no celebration API — a personal best is still worth the local
    // confetti the game already fires; the portal call is simply absent here.
  }

  syncSettings(): void {}

  async commercialBreak(): Promise<void> {
    const sdk = this.sdk;
    if (!sdk?.commercialBreak) return;
    let opened = false;
    try {
      await sdk.commercialBreak(() => {
        opened = true;
        this.events.onAdOpened?.();
      });
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
      const rewarded = await sdk.rewardedBreak(() => {
        opened = true;
        this.events.onAdOpened?.();
      });
      return Boolean(rewarded);
    } catch {
      return false;
    } finally {
      if (opened) this.events.onAdClosed?.();
    }
  }

  mountBanner(_container: HTMLElement): void {
    // Poki intentionally does not expose a banner placement API.
  }
}

class CrazyAdapter implements PlatformAdapter {
  readonly name = "crazy" as const;
  constructor(private readonly events: PlatformEvents) {}

  private get sdk(): CrazySdk | undefined {
    return window.CrazyGames?.SDK;
  }

  gameplayStart(): void {
    this.sdk?.game?.gameplayStart?.();
  }

  gameplayStop(): void {
    this.sdk?.game?.gameplayStop?.();
  }

  loadingFinished(): void {
    this.sdk?.game?.loadingStop?.();
  }

  /** Site-wide celebration for a special moment (personal best). Best-effort. */
  happytime(): void {
    try {
      const r = this.sdk?.game?.happytime?.();
      if (r instanceof Promise) r.catch(() => undefined);
    } catch {
      /* celebration must never break the game */
    }
  }

  /** Push the portal's current mute state into this adapter's events. */
  syncSettings(): void {
    this.events.onPortalMute?.(this.sdk?.game?.settings?.muteAudio === true);
  }

  commercialBreak(): Promise<void> {
    return new Promise((resolve) => {
      const ad = this.sdk?.ad;
      if (!ad?.requestAd) {
        resolve();
        return;
      }
      let opened = false;
      ad.requestAd("midgame", {
        adStarted: () => {
          opened = true;
          this.events.onAdOpened?.();
        },
        adFinished: () => {
          if (opened) this.events.onAdClosed?.();
          resolve();
        },
        adError: () => {
          if (opened) this.events.onAdClosed?.();
          resolve();
        },
      });
    });
  }

  rewardedBreak(): Promise<boolean> {
    return new Promise((resolve) => {
      const ad = this.sdk?.ad;
      if (!ad?.requestAd) {
        resolve(false);
        return;
      }
      let opened = false;
      ad.requestAd("rewarded", {
        adStarted: () => {
          opened = true;
          this.events.onAdOpened?.();
        },
        adFinished: () => {
          if (opened) this.events.onAdClosed?.();
          resolve(true);
        },
        adError: () => {
          if (opened) this.events.onAdClosed?.();
          resolve(false);
        },
      });
    });
  }

  mountBanner(container: HTMLElement): void {
    const banner = this.sdk?.banner;
    if (!CRAZY_BANNER_ID || !banner?.requestBanner || container.childElementCount > 0) return;
    void banner
      .requestBanner({ id: CRAZY_BANNER_ID, width: 320, height: 50 })
      .then((element) => container.appendChild(element))
      .catch(() => undefined);
  }
}

let loadPromise: Promise<PlatformName> | null = null;
let sdkBootPromise: Promise<PlatformName> | null = null;
/**
 * Forwards portal mute changes to the newest adapter's events. The SDK
 * listener is a singleton (registered once at boot), but Game instances come
 * and go under StrictMode remounts — this ref always points at the live one.
 */
let portalMuteHandler: ((muted: boolean) => void) | null = null;
let settingsListenerRegistered = false;

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

/** Boot each portal SDK once; adapters below remain per-Game so their callbacks
 * are fresh after React StrictMode's development remount. */
function bootstrapSdk(target: PlatformName): Promise<PlatformName> {
  if (sdkBootPromise) return sdkBootPromise;
  // Hard cap: a hanging/blocked SDK script must never hold the game hostage.
  const timeout = new Promise<PlatformName>((resolve) => {
    window.setTimeout(() => resolve("none"), SDK_LOAD_TIMEOUT_MS);
  });
  const boot = ensureSdk(target).then(async (loaded) => {
    if (loaded === "poki") {
      try {
        await window.PokiSDK?.init?.();
      } catch {
        // Poki's local sandbox can reject init; preserve a playable build.
      }
    } else if (loaded === "crazy") {
      try {
        await window.CrazyGames?.SDK?.init?.();
        window.CrazyGames?.SDK?.game?.loadingStart?.();
        // Full Implementation requires muteAudio support: honor the current
        // value and every later change, ahead of the in-game audio toggle.
        const game = window.CrazyGames?.SDK?.game;
        portalMuteHandler?.(game?.settings?.muteAudio === true);
        if (!settingsListenerRegistered && game?.addSettingsChangeListener) {
          settingsListenerRegistered = true;
          game.addSettingsChangeListener((s) => portalMuteHandler?.(s.muteAudio === true));
        }
      } catch {
        // Graceful fallback also supports direct local preview.
      }
    }
    return loaded;
  });
  sdkBootPromise = Promise.race([boot, timeout]);
  return sdkBootPromise;
}

/**
 * Initializes exactly one portal SDK script per build. The SDK core is a
 * singleton, while each Game instance gets a fresh event-bound adapter, so
 * React StrictMode re-mounts cannot leave stale audio/input callbacks behind.
 */
export async function initPlatform(events: PlatformEvents): Promise<PlatformAdapter> {
  const target = await bootstrapSdk(portalTarget());
  portalMuteHandler = (muted) => events.onPortalMute?.(muted);
  if (target === "poki") {
    return new PokiAdapter(events);
  }
  if (target === "crazy") {
    const adapter = new CrazyAdapter(events);
    adapter.syncSettings();
    return adapter;
  }
  return new NullAdapter();
}
