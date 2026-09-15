/**
 * PokiAdapter — full Poki HTML5 SDK surface (sdk.poki.com/html5):
 *
 *   init, gameLoadingFinished, gameplayStart/Stop, commercialBreak,
 *   rewardedBreak, getUser, getToken (1-minute backend-verification JWT),
 *   shareableURL, getURLParam, measure (game events).
 *
 * Poki-specific contracts honored here:
 *   • `init()` rejects in the local sandbox → the game still boots
 *     (handled in platform.ts, "load your game anyway").
 *   • `setDebug(true)` is enabled in DEV only — never shipped.
 *   • `getToken()` expires in one minute: it is verified server-side
 *     immediately, never stored (exposed as `getIapToken`).
 *   • `shareableURL({...})` yields a signed, embeddable game link; it is
 *     handed to the Web Share API (or clipboard) so the player chooses the
 *     destination.
 *   • `measure(category, label, action)` follows the start → complete|fail
 *     contract (one outcome per attempt).
 *
 * What Poki does NOT expose: banners, in-SDK score submission, room state,
 * pause hooks, and a data module. Those are honest no-ops; cloud save falls
 * back to localStorage so the save pipeline still works on the Poki build.
 */
import type {
  InviteParams,
  PlatformAdapter,
  PlatformEvents,
  PlatformIdentity,
  PlatformSystemInfo,
} from "./platform";
import { localCloudFallback } from "./local";

type PokiUser = { username: string; avatarUrl?: string | null } | null;
type PokiShareableData = Record<string, string | number | boolean>;

type PokiSdk = {
  init?: () => Promise<void>;
  setDebug?: (on: boolean) => void;
  gameLoadingFinished?: () => void;
  gameplayStart?: () => void;
  gameplayStop?: () => void;
  commercialBreak?: (onStart?: () => void) => Promise<void>;
  rewardedBreak?: (onStart?: () => void) => Promise<boolean>;
  getUser?: () => Promise<PokiUser>;
  /** Short-lived JWT for backend verification (expires in 1 minute). */
  getToken?: () => Promise<string | null>;
  /** Signed shareable URL carrying the given game data. */
  shareableURL?: (data: PokiShareableData) => Promise<string>;
  /** Read a parameter from the page query string (portal share deep-links). */
  getURLParam?: (key: string) => string | null;
  /** Game-events measurement: `measure("level", "1", "start")`. */
  measure?: (category: string, label: string, action: string) => void;
  /** Reposition the mobile Poki Pill: (0–50)% from top + px offset. */
  movePill?: (topPercent: number, topPx: number) => void;
};

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

export class PokiAdapter implements PlatformAdapter {
  readonly name = "poki" as const;
  readonly ready = true;

  constructor(private readonly events: PlatformEvents) {}

  private get sdk(): PokiSdk | undefined {
    return window.PokiSDK;
  }

  capabilities(): string[] {
    return ["lifecycle", "ads", "cloudSaveLocal", "identity", "iap", "urlParams", "share", "measure"];
  }

  environment(): string | null {
    return null;
  }

  /* lifecycle */
  loadingStart(): void {
    /* Poki has no explicit loading-start signal. */
  }

  loadingFinished(): void {
    this.sdk?.gameLoadingFinished?.();
  }

  signalGameReady(): void {
    this.loadingFinished();
  }

  gameplayStart(): void {
    this.sdk?.gameplayStart?.();
  }

  gameplayStop(): void {
    this.sdk?.gameplayStop?.();
  }

  pause(): void {
    /* no portal pause hook on Poki — visibility handling covers it. */
  }

  happytime(): void {
    // Poki has no celebration API — the game's own confetti covers it.
  }

  /* ads */
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

  async showMidgameAd(): Promise<void> {
    await this.commercialBreak();
  }

  async showRewardedAd(): Promise<boolean> {
    return this.rewardedBreak();
  }

  mountBanner(_container: HTMLElement): void {
    // Poki intentionally does not expose a banner placement API.
  }

  /* cloud save — localStorage fallback (Poki has no public data module) */
  saveCloud<T>(key: string, value: T): Promise<void> {
    return localCloudFallback.save(key, value);
  }
  loadCloud<T>(key: string): Promise<T | null> {
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
    return { ...EMPTY_INFO };
  }

  async submitPlatformScore(_score: number): Promise<void> {
    /* Poki has no in-SDK score API — the social server's board covers it */
  }

  async requestAccountLink(): Promise<boolean> {
    return false; // Poki has no account-link prompt
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

  /* game events */
  measure(category: string, label: string, action: "start" | "complete" | "fail"): void {
    try {
      this.sdk?.measure?.(category, label, action);
    } catch {
      /* measurement must never break gameplay */
    }
  }

  /* settings */
  syncSettings(): void {
    /* Poki has no portal mute surface */
  }
  isMuted(): boolean {
    return false;
  }
  getSettings(): { muteAudio: boolean; disableChat: boolean } {
    return { muteAudio: false, disableChat: false };
  }
}
