import { afterEach, describe, expect, it, vi } from "vitest";
import type * as GuardModule from "./rejection-guard";

/**
 * The guard's job in one sentence: when the engine reports a floating
 * promise rejection (`unhandledrejection` on window), it must demote it to a
 * rate-limited console WARN instead of the red "Uncaught (in promise)" error
 * frame — portal QA treats console errors as defects, and the game's network
 * paths are best-effort by design.
 *
 * jsdom has no rendering engine to dispatch the event from a real rejection,
 * so the tests dispatch the exact event the browser would. Each test imports
 * a FRESH module instance (install flag + rate-limit clock are module state)
 * and uninstalls in `afterEach` so listeners never accumulate on the shared
 * jsdom window.
 */

const SINK = () => {};

let guard: typeof GuardModule | null = null;

async function freshGuard(): Promise<typeof GuardModule> {
  vi.resetModules();
  const mod = await import("./rejection-guard");
  mod.installRejectionGuard();
  guard = mod;
  return mod;
}

function rejectionEvent(reason: unknown): PromiseRejectionEvent {
  // A plain Event is a faithful stand-in: the guard only reads `reason` and
  // calls `preventDefault()`, both of which this provides.
  const event = new Event("unhandledrejection", { cancelable: true }) as PromiseRejectionEvent;
  Object.defineProperty(event, "reason", { value: reason });
  return event;
}

afterEach(() => {
  guard?.uninstallRejectionGuard();
  guard = null;
  vi.restoreAllMocks();
});

describe("installRejectionGuard", () => {
  it("demotes an unhandled rejection to a warn (no error frame)", async () => {
    await freshGuard();
    const warn = vi.spyOn(console, "warn").mockImplementation(SINK);
    const error = vi.spyOn(console, "error").mockImplementation(SINK);

    const event = rejectionEvent(new Error("boom: network fell over"));
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true); // browser error frame suppressed
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.map((c) => c.join(" ")).join(" ")).toContain("boom: network fell over");
    expect(error).not.toHaveBeenCalled();
  });

  it("is idempotent — two installs add exactly one listener", async () => {
    vi.resetModules();
    const mod = await import("./rejection-guard");
    const addSpy = vi.spyOn(window, "addEventListener");
    mod.installRejectionGuard();
    mod.installRejectionGuard();
    expect(addSpy.mock.calls.filter((c) => c[0] === "unhandledrejection").length).toBe(1);
    guard = mod; // let afterEach uninstall
  });

  it("rate-limits the warn — a burst of rejections warns once per window", async () => {
    await freshGuard();
    const warn = vi.spyOn(console, "warn").mockImplementation(SINK);
    for (let i = 0; i < 5; i++) window.dispatchEvent(rejectionEvent(new Error(`burst-${i}`)));
    const warns = warn.mock.calls.map((c) => String(c[0]));
    // Five rejections, one warn: the rest are rate-limited.
    expect(warns.length).toBe(1);
    expect(warns[0]).toContain("burst-0");
  });

  it("uninstall stops demoting (restores default behaviour)", async () => {
    await freshGuard();
    const warn = vi.spyOn(console, "warn").mockImplementation(SINK);
    guard?.uninstallRejectionGuard();
    const event = rejectionEvent(new Error("post-uninstall"));
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
});
