/**
 * PokiAdapter — the Poki SDK surface this build targets (lifecycle + ads).
 * Poki does not expose identity, cloud save, invites, or banners; those
 * degrade to honest no-ops (cloud save falls back to localStorage so the
 * save pipeline still works on the Poki build).
 */
import type {
  InviteParams,
  PlatformAdapter,
  PlatformEvents,
  PlatformIdentity,
  PlatformSystemInfo,
} from "./platform";
import { localCloudFallback } from "./local";

type PokiSdk = {
  init?: () => Promise<void>;
  gameplayStart?: () => void;
  gameplayStop?: () => void;
  gameLoadingFinished?: () => void;
  commercialBreak?: (onStart?: () => void) => Promise<void>;
  rewardedBreak?: (onStart?: () => void) => Promise<boolean>;
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

export class PokiAdapter implements PlatformAdapter {
  readonly name = "poki" as const;
  readonly ready = true;

  constructor(private readonly events: PlatformEvents) {}

  private get sdk(): PokiSdk | undefined {
    return window.PokiSDK;
  }

  capabilities(): string[] {
    return ["lifecycle", "ads", "cloudSaveLocal"];
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
    return null; // Poki keeps users anonymous to the game
  }
  getSystemInfo(): PlatformSystemInfo {
    return { ...EMPTY_INFO };
  }
  async submitPlatformScore(_score: number): Promise<void> {
    /* Poki has no in-SDK score API for this build */
  }
  async requestAccountLink(): Promise<boolean> {
    return false;
  }
  async getIapToken(): Promise<string | null> {
    return null;
  }

  /* invites / rooms / share */
  isInstantMultiplayer(): boolean {
    return false;
  }
  getInviteParam(_name: string): string | null {
    return null;
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
  async share(message: string): Promise<boolean> {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ text: message });
        return true;
      } catch {
        return false;
      }
    }
    return false;
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
