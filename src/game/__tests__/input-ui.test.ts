import { afterEach, describe, expect, it, vi } from "vitest";
import { Input } from "../Input";
let input: Input | undefined;
afterEach(() => { input?.dispose(); document.body.innerHTML = ""; });
function fixture(mark = vi.fn()) {
  const host = document.createElement("div");
  document.body.append(host);
  input = new Input(host, mark);
  return { host, input, mark };
}
function key(el: Element, code: string, type = "keydown") {
  const event = new KeyboardEvent(type, { code, bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event;
}
describe("native menu keyboard input", () => {
  it.each(["button", "summary", "input", "select", "textarea", "a"])("does not steal Space or Enter from %s", tag => {
    const { host, input, mark } = fixture();
    const el = document.createElement(tag);
    host.append(el);
    for (const code of ["Space", "Enter"]) {
      expect(key(el, code).defaultPrevented).toBe(false);
      expect(key(el, code, "keyup").defaultPrevented).toBe(false);
    }
    expect(input.p2Key).toBe(false);
    expect(mark).not.toHaveBeenCalled();
  });
  it("retains gameplay keys on the scene and clears a key released after focus changes", () => {
    const { host, input, mark } = fixture();
    expect(key(host, "Space").defaultPrevented).toBe(true);
    expect(mark).toHaveBeenCalledOnce();
    const field = document.createElement("input");
    host.append(field);
    key(field, "Space", "keyup");
    key(host, "Enter");
    expect(input.p2Key).toBe(true);
    key(field, "Enter", "keyup");
    expect(input.p2Key).toBe(false);
  });
  it("keeps Escape available on a menu button", () => {
    const { host, input } = fixture();
    const button = document.createElement("button");
    host.append(button);
    key(button, "Escape");
    expect(input.pausePressed).toBe(true);
  });
});


it.each(["start", "retry"])("does not capture the pointer for %s buttons", action => {
  const { host, mark } = fixture();
  const button = document.createElement("button");
  button.dataset.action = action;
  button.innerHTML = '<svg><path d="M0 0"/></svg>';
  host.append(button);
  const event = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
  button.querySelector("path")!.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(mark).not.toHaveBeenCalled();
});

it("supports independent A/L keys, held aliases, and blur recovery", () => {
  const { host, input } = fixture();
  key(host, "KeyA"); key(host, "KeyL");
  expect(input.diving).toBe(true); expect(input.diving2).toBe(true);
  key(host, "Space"); key(host, "KeyA", "keyup");
  expect(input.diving).toBe(true);
  key(host, "KeyL", "keyup"); expect(input.diving2).toBe(false);
  window.dispatchEvent(new Event("blur")); expect(input.diving).toBe(false);
});

it.each(["vertical", "horizontal"] as const)("routes simultaneous touch independently in %s split", splitMode => {
  const { host, input } = fixture();
  input.splitMode = splitMode;
  vi.spyOn(host, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 400, height: 600 } as DOMRect);
  const point = (id: number, x: number, y: number, type: string) => {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
    Object.defineProperty(event, "pointerId", { value: id });
    host.dispatchEvent(event);
  };
  point(1, 60, 100, "pointerdown");
  point(2, 320, 500, "pointerdown");
  expect(input.diving).toBe(true); expect(input.diving2).toBe(true);
  point(1, 60, 100, "pointercancel");
  expect(input.diving).toBe(false); expect(input.diving2).toBe(true);
  point(2, 320, 500, "pointerup"); expect(input.diving2).toBe(false);
});

describe("mobile touchscreen responsiveness and gesture protection", () => {
  it("prevents default on touchstart for gameplay area to eliminate scroll/pinch latency", () => {
    const { host, mark } = fixture();
    const event = new Event("touchstart", { bubbles: true, cancelable: true });
    host.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(mark).toHaveBeenCalledOnce();
  });

  it("permits default touchstart on interactive text inputs", () => {
    const { host } = fixture();
    const inputField = document.createElement("input");
    host.append(inputField);
    const event = new Event("touchstart", { bubbles: true, cancelable: true });
    inputField.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("spawns a touch ripple on pointerdown for immediate visual touch feedback", () => {
    const { host } = fixture();
    const event = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 120, clientY: 240 });
    Object.defineProperty(event, "pointerId", { value: 1 });
    host.dispatchEvent(event);
    const ripple = document.querySelector(".touch-ripple");
    expect(ripple).not.toBeNull();
    expect((ripple as HTMLElement).style.left).toBe("120px");
    expect((ripple as HTMLElement).style.top).toBe("240px");
  });

  it("triggers boost on intentional quick double-tap", () => {
    const { host, input } = fixture();
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);

    const point = (type: string, clientX = 100, clientY = 100) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY });
      Object.defineProperty(event, "pointerId", { value: 1 });
      if (type === "pointerdown") host.dispatchEvent(event);
      else window.dispatchEvent(event);
    };

    // First tap: quick tap (down at 1000, up at 1080 -> 80ms duration)
    point("pointerdown");
    expect(input.diving).toBe(true);
    now = 1080;
    point("pointerup");
    expect(input.diving).toBe(false);
    expect(input.consumeBoost()).toBe(false);

    // Second tap: arrives 120ms later (at 1200) within 280ms
    now = 1200;
    point("pointerdown");
    expect(input.consumeBoost()).toBe(true);
  });

  it("does NOT trigger boost on rhythmic slope diving / pump dives longer than 220ms", () => {
    const { host, input } = fixture();
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);

    const point = (type: string, clientX = 100, clientY = 100) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY });
      Object.defineProperty(event, "pointerId", { value: 1 });
      if (type === "pointerdown") host.dispatchEvent(event);
      else window.dispatchEvent(event);
    };

    // First dive: held down on slope for 400ms (1000 to 1400)
    point("pointerdown");
    expect(input.diving).toBe(true);
    now = 1400;
    point("pointerup");
    expect(input.diving).toBe(false);
    expect(input.consumeBoost()).toBe(false);

    // Second dive: tap arrives 100ms later on next slope crest
    now = 1500;
    point("pointerdown");
    // Because the first dive was a sustained slope carve (> 220ms), boost must NOT be accidentally consumed!
    expect(input.consumeBoost()).toBe(false);
  });

  it("captures pointerdown anywhere across window for full-screen touch responsiveness", () => {
    const { input } = fixture();
    const event = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 50, clientY: 50 });
    Object.defineProperty(event, "pointerId", { value: 7 });
    window.dispatchEvent(event);
    expect(input.diving).toBe(true);
    const upEvent = new MouseEvent("pointerup", { bubbles: true, cancelable: true });
    Object.defineProperty(upEvent, "pointerId", { value: 7 });
    window.dispatchEvent(upEvent);
    expect(input.diving).toBe(false);
  });

  it("triggers boost on upward flick / swipe-up gesture", () => {
    const { host, input } = fixture();
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);

    const down = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 150, clientY: 300 });
    Object.defineProperty(down, "pointerId", { value: 3 });
    host.dispatchEvent(down);
    expect(input.diving).toBe(true);

    now = 1150; // 150ms flick duration
    const up = new MouseEvent("pointerup", { bubbles: true, cancelable: true, clientX: 155, clientY: 240 }); // dy = -60px
    Object.defineProperty(up, "pointerId", { value: 3 });
    window.dispatchEvent(up);

    expect(input.diving).toBe(false);
    expect(input.consumeBoost()).toBe(true);
  });

  it("spawns player-specific touch ripples in split-screen mode", () => {
    const { host, input } = fixture();
    input.splitMode = "vertical";
    vi.spyOn(host, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 400, height: 600 } as DOMRect);

    // P1 touch on left half
    const p1Down = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 100, clientY: 200 });
    Object.defineProperty(p1Down, "pointerId", { value: 10 });
    host.dispatchEvent(p1Down);

    const p1Ripple = document.querySelector(".touch-ripple.p1");
    expect(p1Ripple).not.toBeNull();

    // P2 touch on right half
    const p2Down = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 300, clientY: 200 });
    Object.defineProperty(p2Down, "pointerId", { value: 11 });
    host.dispatchEvent(p2Down);

    const p2Ripple = document.querySelector(".touch-ripple.p2");
    expect(p2Ripple).not.toBeNull();
  });
});
