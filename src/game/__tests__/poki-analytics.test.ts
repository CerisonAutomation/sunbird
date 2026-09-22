import { afterEach, describe, expect, it, vi } from "vitest";
import { GameplayEventSink } from "../GameplayEvents";
import { PokiAdapter } from "../../sdk/poki";

/**
 * Poki analytics coverage — the event surface that feeds Poki's dashboard.
 *
 * Poki's own analytics are driven entirely by the SDK calls the game makes:
 * loading lifecycle, gameplayStart/Stop, commercialBreak, rewardedBreak and
 * happytime. There is no separate analytics beacon to add — the correct
 * implementation is that every one of these calls forwards EXACTLY ONCE, in
 * an order the Inspector accepts (no consecutive duplicates), with ad-open /
 * ad-close bookkeeping that mutes and un-mutes the game around the break.
 *
 * These tests pin that contract at the adapter boundary with a recording SDK
 * double, and pin the sink's dedupe guarantees end to end.
 */

afterEach(() => {
  delete (window as unknown as { PokiSDK?: unknown }).PokiSDK;
});

type Calls = string[];
function recordingSdk() {
  const calls: Calls = [];
  const sdk = {
    gameLoadingFinished: () => calls.push("gameLoadingFinished"),
    gameplayStart: () => calls.push("gameplayStart"),
    gameplayStop: () => calls.push("gameplayStop"),
    happytime: () => calls.push("happytime"),
    commercialBreak: async (onStart?: () => void) => {
      calls.push("commercialBreak:open");
      onStart?.();
    },
    rewardedBreak: async (onStart?: () => void) => {
      calls.push("rewardedBreak:open");
      onStart?.();
      return true;
    },
  };
  return { calls, sdk };
}

function platformWith(calls: Calls, sdk: unknown): PokiAdapter {
  // The adapter reads the SDK off `window.PokiSDK` (the global the loader
  // script installs). Installing the double there is exactly what the real
  // boot path produces — no private-field surgery.
  (window as unknown as { PokiSDK?: unknown }).PokiSDK = sdk;
  return new PokiAdapter({
    onAdOpened: () => calls.push("ad:opened"),
    onAdClosed: () => calls.push("ad:closed"),
  });
}

describe("Poki analytics coverage (SDK event surface)", () => {
  it("forwards gameplayStart/Stop and loadingFinished exactly once each", () => {
    const { calls, sdk } = recordingSdk();
    const p = platformWith(calls, sdk);
    p.gameplayStart();
    p.gameplayStop();
    p.signalGameReady();
    expect(calls).toEqual(["gameplayStart", "gameplayStop", "gameLoadingFinished"]);
  });

  it("fires happytime() for milestone celebrations (Poki's celebratory overlay + analytics)", () => {
    const { calls, sdk } = recordingSdk();
    const p = platformWith(calls, sdk);
    p.happytime();
    expect(calls).toEqual(["happytime"]);
  });

  it("commercialBreak forwards with ad-open/close bookkeeping, never throws into gameplay", async () => {
    const { calls, sdk } = recordingSdk();
    const p = platformWith(calls, sdk);
    await p.commercialBreak();
    expect(calls).toEqual(["commercialBreak:open", "ad:opened", "ad:closed"]);
  });

  it("rewardedBreak returns the SDK's verdict and books the ad lifecycle", async () => {
    const { calls, sdk } = recordingSdk();
    const p = platformWith(calls, sdk);
    await expect(p.rewardedBreak()).resolves.toBe(true);
    expect(calls).toEqual(["rewardedBreak:open", "ad:opened", "ad:closed"]);
  });

  it("a missing SDK is a silent no-op (off-portal preview stays analytics-free)", async () => {
    const p = platformWith([], undefined);
    expect(() => p.gameplayStart()).not.toThrow();
    expect(() => p.gameplayStop()).not.toThrow();
    expect(() => p.happytime()).not.toThrow();
    await expect(p.commercialBreak()).resolves.toBeUndefined();
    await expect(p.rewardedBreak()).resolves.toBe(false);
  });

  it("the canonical death → break → restart lifecycle emits the exact dashboard order", async () => {
    const { calls, sdk } = recordingSdk();
    const p = platformWith(calls, sdk);
    const sink = new GameplayEventSink((phase) => (phase === "start" ? p.gameplayStart() : p.gameplayStop()));

    sink.send("start"); // player launches a run
    sink.send("stop"); // death
    sink.send("stop"); // defensive resend before the break — must be suppressed
    const brk = p.commercialBreak(); // the ad seam
    await brk; // the ad lifecycle completes before gameplay resumes
    sink.send("start"); // restart

    expect(calls).toEqual(["gameplayStart", "gameplayStop", "commercialBreak:open", "ad:opened", "ad:closed", "gameplayStart"]);
    // Poki's hard rule, asserted structurally: no two consecutive identical
    // gameplay events ever reach the SDK (ad bookkeeping entries excluded).
    const gameplay = calls.filter((c) => c === "gameplayStart" || c === "gameplayStop");
    for (let i = 1; i < gameplay.length; i++) {
      expect(gameplay[i], gameplay.join(",")).not.toBe(gameplay[i - 1]);
    }
  });

  it("a rewarded Second Wind books: stop is already sent, rewarded opens+closes, start returns", async () => {
    const { calls, sdk } = recordingSdk();
    const p = platformWith(calls, sdk);
    const sink = new GameplayEventSink((phase) => (phase === "start" ? p.gameplayStart() : p.gameplayStop()));

    sink.send("start");
    sink.send("stop"); // death — gameplay events stop before any ad
    const rewarded = await p.rewardedBreak();
    sink.send("start"); // Second Wind revives the run
    expect(rewarded).toBe(true);
    expect(calls).toEqual(["gameplayStart", "gameplayStop", "rewardedBreak:open", "ad:opened", "ad:closed", "gameplayStart"]);
  });

  it("sink dedupe is enforced even with a hot resend loop (Inspector's duplicate trap)", () => {
    const emit = vi.fn();
    const sink = new GameplayEventSink(emit);
    for (let i = 0; i < 50; i++) sink.send("start");
    for (let i = 0; i < 50; i++) sink.send("stop");
    sink.send("stop");
    expect(emit.mock.calls.map((c) => c[0])).toEqual(["start", "stop"]);
  });
});

describe("Poki ad-placement canon (guideline: breaks only at natural break points)", () => {
  // Reads the live source so a new call site can never ship unreviewed: every
  // commercial break must sit in a named placement method, and the placement
  // set must match Poki's documented break points exactly — restart, resume
  // from pause, back-to-menu for commercial breaks; Second-Wind continue and
  // the results 3× bonus for rewarded breaks. Mid-gameplay breaks are banned.
  it("routes every break through exactly the canonical placement methods", async () => {
    const fs = await import("node:fs");
    const join = (await import("node:path")).join;
    const src = fs.readFileSync(join(process.cwd(), "src", "game", "Game.ts"), "utf8");

    const commercial = [...src.matchAll(/await platform\.commercialBreak\(\)/g)].length
      + [...src.matchAll(/await this\.platform\?\.commercialBreak\(\)/g)].length;
    const rewarded = [...src.matchAll(/await platform\.rewardedBreak\(\)/g)].length;
    expect(commercial).toBe(3); // restartWithPortalBreak, resumeFromPause, menuAfterPortalBreak
    expect(rewarded).toBe(2); // multiplierWithPortalReward, continueWithPortalReward

    for (const fn of ["restartWithPortalBreak", "resumeFromPause", "menuAfterPortalBreak"]) {
      expect(src).toContain(`private async ${fn}`);
    }
    for (const fn of ["continueWithPortalReward", "multiplierWithPortalReward"]) {
      expect(src).toContain(`private async ${fn}`);
    }
    // Every break request carries a placement label for the dashboard.
    for (const placement of ['"restart"', '"resume"', '"to-menu"', '"continue"', '"results-multiplier"']) {
      expect(src).toContain(`placement: ${placement}`);
    }
  });
});
