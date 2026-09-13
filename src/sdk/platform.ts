/**
 * Platform SDK adapter for Poki and CrazyGames portal integration.
 *
 * Each portal requires its own SDK script tag in index.html and has strict
 * rules: no external ads, audio must mute during ad breaks, input must be
 * disabled, and gameplayStart/gameplayStop must bracket every play session.
 *
 * Local dev falls back to NullAdapter (no-op).
 */

export type PlatformName = "poki" | "crazy" | "none";

export interface PlatformEvents {
  onAdOpened?: () => void;
  onAdClosed?: () => void;
}

export interface PlatformAdapter {
  readonly name: PlatformName;
  gameplayStart(): void;
  gameplayStop(): void;
  loadingFinished(): void;
  /** Natural break — resolves when the ad finishes (or immediately if none). */
  commercialBreak(): Promise<void>;
  /** Rewarded break — resolves true only if the player earned the reward. */
  rewardedBreak(): Promise<boolean>;
  mountBanner(container: HTMLElement): void;
}

const noop = () => {};

// Create in the CrazyGames dashboard, then paste here:
const CRAZY_BANNER_ID = "";

/* ---------- Null (local dev) ---------- */

class NullAdapter implements PlatformAdapter {
  readonly name = "none" as const;
  gameplayStart = noop;
  gameplayStop = noop;
  loadingFinished = noop;
  mountBanner = noop;
  async commercialBreak() {
    /* dev: instant — no ad shown */
  }
  async rewardedBreak() {
    return true;
  }
}

/* ---------- Poki ---------- */

class PokiAdapter implements PlatformAdapter {
  readonly name = "poki" as const;
  constructor(private events: PlatformEvents) {}

  private sdk(): any {
    return (window as any).PokiSDK;
  }

  gameplayStart() {
    this.sdk()?.gameplayStart();
  }
  gameplayStop() {
    this.sdk()?.gameplayStop();
  }
  loadingFinished() {
    this.sdk()?.gameLoadingFinished();
  }
  commercialBreak(): Promise<void> {
    return new Promise((resolve) => {
      this.sdk()
        .commercialBreak(() => this.events.onAdOpened?.())
        .then(() => {
          this.events.onAdClosed?.();
          resolve();
        })
        .catch(() => {
          this.events.onAdClosed?.();
          resolve();
        });
    });
  }
  rewardedBreak(): Promise<boolean> {
    return new Promise((resolve) => {
      this.sdk()
        .rewardedBreak(() => this.events.onAdOpened?.())
        .then((ok: boolean) => {
          this.events.onAdClosed?.();
          resolve(!!ok);
        })
        .catch(() => {
          this.events.onAdClosed?.();
          resolve(false);
        });
    });
  }
  mountBanner = noop; // Poki serves no banner units through the SDK
}

/* ---------- CrazyGames ---------- */

class CrazyAdapter implements PlatformAdapter {
  readonly name = "crazy" as const;
  constructor(private events: PlatformEvents) {}

  private sdk(): any {
    return (window as any).CrazyGames?.SDK;
  }

  private cbs(
    kind: "midgame" | "rewarded",
    done: (earned: boolean) => void,
  ): {
    adStarted: () => void;
    adFinished: () => void;
    adError: (e: unknown, d: unknown) => void;
  } {
    return {
      adStarted: () => this.events.onAdOpened?.(),
      adFinished: () => {
        this.events.onAdClosed?.();
        done(kind === "rewarded");
      },
      adError: (e: unknown, d: unknown) => {
        console.warn(`[ads] ${kind} failed`, e, d);
        this.events.onAdClosed?.();
        done(false);
      },
    };
  }

  gameplayStart() {
    this.sdk()?.game?.gameplayStart();
  }
  gameplayStop() {
    this.sdk()?.game?.gameplayStop();
  }
  loadingFinished() {
    this.sdk()?.game?.loadingStop();
  }
  commercialBreak(): Promise<void> {
    return new Promise((resolve) => {
      const sdk = this.sdk();
      if (!sdk?.ad) return resolve();
      sdk.ad.requestAd("midgame", this.cbs("midgame", () => resolve()));
    });
  }
  rewardedBreak(): Promise<boolean> {
    return new Promise((resolve) => {
      const sdk = this.sdk();
      if (!sdk?.ad) return resolve(false);
      sdk.ad.requestAd("rewarded", this.cbs("rewarded", (earned) => resolve(earned)));
    });
  }
  mountBanner(container: HTMLElement) {
    const sdk = this.sdk();
    if (!CRAZY_BANNER_ID || !sdk?.banner || container.childElementCount > 0) return;
    sdk.banner
      .requestBanner({ id: CRAZY_BANNER_ID, width: 320, height: 50 })
      .then((el: HTMLElement) => {
        if (el) container.appendChild(el);
      })
      .catch(() => {});
  }
}

/* ---------- Singleton init (StrictMode-safe) ---------- */

let adapterPromise: Promise<PlatformAdapter> | null = null;

export function initPlatform(events: PlatformEvents): Promise<PlatformAdapter> {
  if (adapterPromise) return adapterPromise;
  adapterPromise = (async () => {
    const w = window as any;
    if (w.PokiSDK) {
      try {
        await w.PokiSDK.init();
      } catch {
        /* sandbox / debug quirk */
      }
      return new PokiAdapter(events);
    }
    if (w.CrazyGames?.SDK) {
      try {
        await w.CrazyGames.SDK.init();
        w.CrazyGames.SDK.game?.loadingStart?.();
      } catch {
        /* keep going */
      }
      return new CrazyAdapter(events);
    }
    return new NullAdapter();
  })();
  return adapterPromise;
}
