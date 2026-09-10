export type PlatformName = "poki" | "crazy" | "none";

export type PlatformEvents = {
  onAdOpened?: () => void;
  onAdClosed?: () => void;
};

export interface PlatformAdapter {
  readonly name: PlatformName;
  gameplayStart(): void;
  gameplayStop(): void;
  loadingFinished(): void;
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
  game?: { loadingStart?: () => void; loadingStop?: () => void; gameplayStart?: () => void; gameplayStop?: () => void };
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
const POKI_SRC = "https://game-cdn.poki.com/scripts/v2/poki-sdk.js";
const CRAZY_SRC = "https://sdk.crazygames.com/crazygames-sdk-v3.js";

export function portalTarget(): PlatformName {
  return TARGET === "poki" ? "poki" : TARGET === "crazy" || TARGET === "crazygames" ? "crazy" : "none";
}

export function isPortalBuild(): boolean {
  return portalTarget() !== "none";
}

class NullAdapter implements PlatformAdapter {
  readonly name = "none" as const;
  gameplayStart(): void {}
  gameplayStop(): void {}
  loadingFinished(): void {}
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

function scriptFor(target: PlatformName): string | null {
  if (target === "poki") return POKI_SRC;
  if (target === "crazy") return CRAZY_SRC;
  return null;
}

function ensureSdk(target: PlatformName): Promise<PlatformName> {
  if (target === "none") return Promise.resolve("none");
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
  sdkBootPromise = ensureSdk(target).then(async (loaded) => {
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
      } catch {
        // Graceful fallback also supports direct local preview.
      }
    }
    return loaded;
  });
  return sdkBootPromise;
}

/**
 * Initializes exactly one portal SDK script per build. The SDK core is a
 * singleton, while each Game instance gets a fresh event-bound adapter, so
 * React StrictMode re-mounts cannot leave stale audio/input callbacks behind.
 */
export async function initPlatform(events: PlatformEvents): Promise<PlatformAdapter> {
  const target = await bootstrapSdk(portalTarget());
  if (target === "poki") {
    return new PokiAdapter(events);
  }
  if (target === "crazy") {
    return new CrazyAdapter(events);
  }
  return new NullAdapter();
}
