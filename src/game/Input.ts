export class Input {
  enabled = true;
  held = false;
  pausePressed = false;
  restartPressed = false;
  boostPressed = false;
  /** Player 2: Enter / right-half touch / second gamepad. */
  p2Key = false;
  p2Touch = false;
  private space = false;
  private readonly keys = new Set<string>();
  private readonly boundBlur = () => this.resetHeld();
  private padP1 = false;
  private padP2 = false;
  /** In versus mode a tap is routed to a player by which half of the screen it lands on. */
  splitMode: "off" | "vertical" | "horizontal" = "off";
  private readonly touches = new Map<number, 1 | 2>();
  private first = false;
  private lastTapAt = 0;
  private readonly onFirstGesture: () => void;
  private readonly el: HTMLElement;
  private readonly boundPointerDown: (e: PointerEvent) => void;
  private readonly boundPointerUp: (e: PointerEvent) => void;
  private readonly boundPointerCancel: (e: PointerEvent) => void;
  private readonly boundKeyDown: (e: KeyboardEvent) => void;
  private readonly boundKeyUp: (e: KeyboardEvent) => void;
  private readonly boundContext: (e: Event) => void;

  constructor(el: HTMLElement, onFirstGesture: () => void) {
    this.el = el;
    this.onFirstGesture = onFirstGesture;
    this.boundPointerDown = (e) => this.onPointerDown(e);
    this.boundPointerUp = (e) => this.onPointerUp(e);
    this.boundPointerCancel = (e: PointerEvent) => this.onPointerUp(e);
    this.boundKeyDown = (e) => this.onKeyDown(e);
    this.boundKeyUp = (e) => this.onKeyUp(e);
    this.boundContext = (e) => e.preventDefault();

    el.addEventListener("pointerdown", this.boundPointerDown);
    window.addEventListener("pointerup", this.boundPointerUp);
    window.addEventListener("pointercancel", this.boundPointerCancel);
    window.addEventListener("blur", this.boundBlur);
    window.addEventListener("keydown", this.boundKeyDown);
    window.addEventListener("keyup", this.boundKeyUp);
    el.addEventListener("contextmenu", this.boundContext);
  }

  get diving(): boolean {
    return this.enabled && (this.held || this.space || this.padP1);
  }

  /** Player 2's dive input. */
  get diving2(): boolean {
    return this.enabled && (this.p2Key || this.p2Touch || this.padP2);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.resetHeld();
  }

  /** Poll gamepads once per frame: pad 0 drives P1, pad 1 drives P2. */
  pollGamepads(): void {
    const pads = navigator.getGamepads?.();
    if (!pads) {
      this.padP1 = false;
      this.padP2 = false;
      return;
    }
    const pressed = (i: number): boolean => {
      const p = pads[i];
      if (!p) return false;
      for (const b of p.buttons) if (b?.pressed) return true;
      return Math.abs(p.axes[1] ?? 0) > 0.6;
    };
    this.padP1 = pressed(0);
    this.padP2 = pressed(1);
  }

  consumePause(): boolean {
    const v = this.pausePressed;
    this.pausePressed = false;
    return v;
  }

  consumeRestart(): boolean {
    const v = this.restartPressed;
    this.restartPressed = false;
    return v;
  }

  consumeBoost(): boolean {
    const v = this.boostPressed;
    this.boostPressed = false;
    return v;
  }

  dispose(): void {
    this.el.removeEventListener("pointerdown", this.boundPointerDown);
    window.removeEventListener("pointerup", this.boundPointerUp);
    window.removeEventListener("pointercancel", this.boundPointerCancel);
    window.removeEventListener("blur", this.boundBlur);
    window.removeEventListener("keydown", this.boundKeyDown);
    window.removeEventListener("keyup", this.boundKeyUp);
    this.el.removeEventListener("contextmenu", this.boundContext);
  }

  private markFirst(): void {
    if (this.first) return;
    this.first = true;
    this.onFirstGesture();
  }

  private isInteractive(target: EventTarget | null): boolean {
    // Element, not HTMLElement: clicks land on inline <svg>/<path> icons
    // inside buttons, and those are SVGElements. Treating them as
    // non-interactive made the input layer pointer-capture the event and
    // swallow the tap.
    if (!(target instanceof Element)) return false;
    if (target.closest("input, textarea, select, a, summary, label, [contenteditable=true]")) return true;
    // Every DOM action, including Start/Retry, owns its pointer sequence.
    // Capturing Retry's pointer used to retarget its click away from the button.
    return Boolean(target.closest("button, [data-action]"));
  }

  private isTyping(target: EventTarget | null): boolean {
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof Element && !!target.closest("[contenteditable=true]"));
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.enabled) return;
    if (this.isInteractive(e.target)) return;
    if (!this.isTyping(e.target)) e.preventDefault();
    this.markFirst();
    const now = performance.now();
    if (now - this.lastTapAt <= 280) this.boostPressed = true;
    this.lastTapAt = now;
    const who = this.whichPlayer(e);
    this.touches.set(e.pointerId, who);
    if (who === 2) this.p2Touch = true;
    else this.held = true;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  private whichPlayer(e: PointerEvent): 1 | 2 {
    if (this.splitMode === "off") return 1;
    const r = this.el.getBoundingClientRect();
    if (this.splitMode === "vertical") return e.clientX - r.left > r.width / 2 ? 2 : 1;
    return e.clientY - r.top > r.height / 2 ? 2 : 1;
  }

  private onPointerUp(e: PointerEvent): void {
    const who = this.touches.get(e.pointerId);
    this.touches.delete(e.pointerId);
    if (who === 2) {
      this.p2Touch = [...this.touches.values()].includes(2);
    } else {
      this.held = [...this.touches.values()].includes(1);
    }
    if (this.splitMode === "off") this.held = this.touches.size > 0;
  }

  private onPointerEnd(): void {
    this.touches.clear();
    this.held = false;
    this.p2Touch = false;
  }

  private resetHeld(): void {
    this.onPointerEnd();
    this.keys.clear();
    this.space = this.p2Key = this.padP1 = this.padP2 = false;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.enabled) return;
    if (e.repeat || this.isTyping(e.target)) return;
    // Enter/Space must activate native menu controls, not hold a bird down.
    if (e.code !== "Escape" && e.target instanceof Element && e.target.closest("button, a, summary, [role=button]")) return;
    if (e.code === "Space" || e.code === "KeyA") {
      e.preventDefault();
      this.markFirst();
      this.keys.add(e.code);
      this.space = true;
    } else if (e.code === "Enter" || e.code === "NumpadEnter" || e.code === "ShiftRight" || e.code === "KeyL") {
      e.preventDefault();
      this.markFirst();
      this.keys.add(e.code);
      this.p2Key = true;
    } else if (e.code === "KeyP" || e.code === "Escape") {
      this.pausePressed = true;
    } else if (e.code === "KeyR") {
      this.restartPressed = true;
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    // Releasing one alias must not release the player's other held key.
    if (this.keys.has(e.code)) e.preventDefault();
    this.keys.delete(e.code);
    this.space = this.keys.has("Space") || this.keys.has("KeyA");
    this.p2Key = ["Enter", "NumpadEnter", "ShiftRight", "KeyL"].some(code => this.keys.has(code));
  }
}
