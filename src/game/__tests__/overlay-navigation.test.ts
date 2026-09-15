import { afterEach, describe, expect, it, vi } from "vitest";
import { OverlayNavigation } from "../OverlayNavigation";
afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });

describe("overlay keyboard boundary", () => {
  it("skips closed-disclosure controls even if the browser reports client rects", () => {
    document.body.innerHTML = '<div id="host"><canvas></canvas><div id="hud"><div class="play-hud"></div><div class="overlay"><h2>Settings</h2><button>Back</button><details><summary>Advanced</summary><button>Reset</button></details></div></div></div>';
    const root = document.getElementById("hud")!;
    const overlay = root.querySelector<HTMLElement>(".overlay")!;
    const nav = new OverlayNavigation(root);
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
    nav.sync(overlay);
    expect(overlay.getAttribute("role")).toBe("dialog");
    expect(root.querySelector<HTMLElement>(".play-hud")!.inert).toBe(true);
    const summary = overlay.querySelector("summary")!;
    summary.focus();
    summary.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(overlay.querySelector("button"));
    document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(summary);
    nav.sync(null);
    expect(document.activeElement).toBe(document.querySelector("canvas"));
    expect(overlay.inert).toBe(true);
    nav.dispose();
  });
});
