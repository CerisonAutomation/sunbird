import { afterEach, describe, expect, it, vi } from "vitest";
import { HUD } from "../HUD";
import { feedbackSlot } from "../HudFeedback";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = ""; });

function fixture() {
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect = disconnect; });
  const hud = new HUD(document.body);
  return { hud, root: document.querySelector<HTMLElement>(".hud-root")!, disconnect };
}

describe("readable HUD feedback", () => {
  it("gives countdown / finish / launch / goal precedence over coaching", () => {
    const state = { countdown: 3, finishRemaining: 8, launchBannerT: 1, goalPop: "Goal!" };
    expect(feedbackSlot(state)).toBe("countdown");
    state.countdown = 0;
    expect(feedbackSlot(state)).toBe("finish");
    state.finishRemaining = 0;
    expect(feedbackSlot(state)).toBe("launch");
    state.launchBannerT = 0;
    expect(feedbackSlot(state)).toBe("goal");
    state.finishRemaining = 4000; // no finish widget yet; do not suppress coaching
    state.goalPop = "";
    expect(feedbackSlot(state)).toBe("hint");
  });

  it("keeps the menu sky/hero layers in the hud-root z-stack, dormant until the menu shows", () => {
    const { hud, root, disconnect } = fixture();
    // The main-screen background lives INSIDE .hud-root: the sky canvas (z0)
    // sits behind the paper card (z1) and the hero sunbird layer (z3) floats
    // above it. As siblings of .hud-root (z4) they would render behind the
    // frosted card — the hero bird disappears (merge regression 2026-09).
    const sky = root.querySelector(".menu-sky");
    const hero = root.querySelector(".menu-hero-layer");
    expect(sky).not.toBeNull();
    expect(hero).not.toBeNull();
    expect(sky!.querySelector("canvas")).not.toBeNull();
    expect(hero!.querySelector("canvas")).not.toBeNull();
    // Hero layer is the last child of the root: painted above the card.
    expect(root.lastElementChild).toBe(hero);
    // Dormant until the menu is shown: no .on class, no sized canvas buffers
    // (unsized canvases stay at the 300×150 default — no memory, no rAF).
    expect(sky!.classList.contains("on")).toBe(false);
    expect(hero!.classList.contains("on")).toBe(false);
    for (const c of root.querySelectorAll("canvas")) expect(c.width).toBe(300);
    expect(root.querySelectorAll(".top-bar .hud-controls button")).toHaveLength(2);
    expect(root.querySelector(".hud-header .roster-bar")).not.toBeNull();
    expect(root.querySelector(".flight-footer .fever-wrap")).not.toBeNull();
    expect(root.querySelectorAll(".flight-messages > *")).toHaveLength(5);
    hud.dispose();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("bounds notifications, deduplicates without layout reads and cancels disposal timers", () => {
    vi.useFakeTimers();
    const { hud, root } = fixture();
    root.dataset.flying = "true";
    hud.toast("Butter landing", "cloud");
    hud.toast("Butter landing", "cloud");
    expect(root.querySelector(".toast")?.textContent).toBe("Butter landing ×2");
    hud.toast("Through the ring", "gold");
    expect(root.querySelectorAll(".toast")).toHaveLength(1);
    expect(root.querySelector(".toast")?.textContent).toBe("Through the ring");
    root.dataset.flying = "false";
    hud.toast("Menu reward");
    expect(root.querySelectorAll(".toast")).toHaveLength(2);
    hud.flash("perfect");
    vi.advanceTimersByTime(32); // complete CSS-enter requestAnimationFrames
    hud.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(document.querySelector(".hud-root")).toBeNull();
  });
});
