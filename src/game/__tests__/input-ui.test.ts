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
