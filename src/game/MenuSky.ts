/**
 * MenuSky — the living "birds in motion" background for the shell.
 *
 * Deliberately cheap: one 2D canvas, a fixed small flock (no particle spam),
 * capped device pixel ratio, and ~30 Hz ambient update. It pauses completely
 * when the menu is not visible and renders a single static frame under
 * `prefers-reduced-motion`. This is decorative-only and never touches the
 * 3D scene or gameplay.
 *
 * Performance notes (why it stays cheap even with the hero bird):
 *  • All gradients + the two hill silhouettes are built ONCE per resize and
 *    reused every frame (gradient objects + Path2D), so the per-frame cost is
 *    fills and ~20 tiny strokes — zero allocation, zero GC churn.
 *  • resize() is a no-op unless the size/DPR actually changed. Setting
 *    canvas.width clears the canvas, and the old unconditional resize was the
 *    source of visible flashing (blank canvas until the next 30 Hz tick).
 */

import { FLAP_NEUTRAL, drawSunbird } from "./Sunbird.js";

type Flocker = {
  x: number;
  y: number;
  scale: number;
  speed: number;
  flap: number;
  flapRate: number;
  drift: number;
  depth: number;
};

const FLOCK_SIZE = 7;

export class MenuSky {
  readonly host: HTMLDivElement;
  /** Transparent overlay canvas that draws the hero bird ABOVE the UI card. */
  readonly heroHost: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly heroCanvas: HTMLCanvasElement;
  private readonly hctx: CanvasRenderingContext2D | null;
  private readonly birds: Flocker[] = [];
  private readonly reduceMotion: boolean;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private time = 0;
  /** Independent slow clock for the hero bird (its own drift, not the flock's). */
  private heroT = Math.random() * 100;
  private active = false;
  private heroActive = true;
  private width = 1;
  private height = 1;
  private dpr = 1;

  // Cached per-resize scenery (rebuilt only when the canvas really changes).
  private skyGrad: CanvasGradient | null = null;
  private hazeGrad: CanvasGradient | null = null;
  private hillFar: Path2D | null = null;
  private hillNear: Path2D | null = null;

  constructor() {
    this.reduceMotion =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;

    this.host = document.createElement("div");
    this.host.className = "menu-sky";
    this.host.setAttribute("aria-hidden", "true");

    this.canvas = document.createElement("canvas");
    this.canvas.className = "menu-sky-canvas";
    this.host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");

    this.heroHost = document.createElement("div");
    this.heroHost.className = "menu-hero-layer";
    this.heroHost.setAttribute("aria-hidden", "true");
    this.heroCanvas = document.createElement("canvas");
    this.heroCanvas.className = "menu-sky-canvas";
    this.heroHost.appendChild(this.heroCanvas);
    this.hctx = this.heroCanvas.getContext("2d");

    for (let i = 0; i < FLOCK_SIZE; i++) {
      const depth = i / (FLOCK_SIZE - 1);
      this.birds.push({
        x: Math.random(),
        y: 0.06 + depth * 0.34 + Math.random() * 0.16,
        scale: 0.5 + depth * 0.95,
        speed: 0.012 + depth * 0.03,
        flap: Math.random() * Math.PI * 2,
        flapRate: 7 + Math.random() * 3.5,
        drift: 0.012 + Math.random() * 0.02,
        depth,
      });
    }
  }

  resize(width: number, height: number): void {
    if (width < 2 || height < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    // No-op when nothing changed — the old unconditional path cleared the
    // canvas every HUD update and caused visible flashing.
    if (width === this.width && height === this.height && dpr === this.dpr) return;
    this.dpr = dpr;
    this.width = width;
    this.height = height;
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    if (this.ctx) this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.heroCanvas.width = Math.floor(width * dpr);
    this.heroCanvas.height = Math.floor(height * dpr);
    this.heroCanvas.style.width = `${width}px`;
    this.heroCanvas.style.height = `${height}px`;
    if (this.hctx) this.hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.buildScenery();
    // Paint immediately so a resize never leaves a blank frame behind.
    this.draw(0);
  }

  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    this.host.classList.toggle("on", active);
    this.heroHost.classList.toggle("on", active && this.heroActive);
    if (active && !this.reduceMotion) this.start();
    else this.stop();
    if (active) this.draw(0);
  }

  setHeroActive(active: boolean): void {
    if (this.heroActive === active) return;
    this.heroActive = active;
    this.heroHost.classList.toggle("on", this.active && active);
    if (!active && this.hctx) {
      this.hctx.clearRect(0, 0, this.width, this.height);
    }
  }

  dispose(): void {
    this.stop();
    this.host.remove();
    this.heroHost.remove();
  }

  private start(): void {
    if (this.raf) return;
    this.last = performance.now();
    const tick = (now: number): void => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.acc += dt;
      // Ambient layer: 30 Hz is indistinguishable here and halves the cost.
      if (this.acc >= 1 / 30) {
        const step = this.acc;
        this.acc = 0;
        this.time += step;
        this.draw(step);
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.acc = 0;
  }

  /** Gradients + hill silhouettes are rebuilt only on a real resize. */
  private buildScenery(): void {
    const { ctx, height: h } = this;
    if (!ctx) return;

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#1d3f6b");
    sky.addColorStop(0.36, "#4f86bd");
    sky.addColorStop(0.62, "#9cc9e6");
    sky.addColorStop(0.82, "#f0c9a0");
    sky.addColorStop(1, "#f6b96f");
    this.skyGrad = sky;

    // No painted sun here — the paper card's own hero-sun disc is the one sun
    // on the title screen. A second bloom at the top-right read as a stray sun.
    const haze = ctx.createLinearGradient(0, h * 0.55, 0, h);
    haze.addColorStop(0, "rgba(255, 214, 160, 0)");
    haze.addColorStop(1, "rgba(255, 198, 138, 0.22)");
    this.hazeGrad = haze;

    this.hillFar = this.buildHill(0.66, 1.1, 2.1);
    this.hillNear = this.buildHill(0.76, 0.8, 4.3);
  }

  private buildHill(baseY: number, amp: number, freq: number): Path2D | null {
    if (typeof Path2D === "undefined") return null;
    const { width: w, height: h } = this;
    const p = new Path2D();
    const y0 = h * baseY;
    p.moveTo(0, h);
    for (let x = 0; x <= w; x += 14) {
      const t = x / w;
      const y = y0 - Math.sin(t * Math.PI * freq + freq) * (h * 0.03 * amp) - Math.sin(t * 9.1) * (h * 0.012 * amp);
      p.lineTo(x, y);
    }
    p.lineTo(w, h);
    p.closePath();
    return p;
  }

  private draw(dt: number): void {
    const w = this.width;
    const h = this.height;
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.skyGrad) this.buildScenery();

    if (this.skyGrad) {
      ctx.fillStyle = this.skyGrad;
      ctx.fillRect(0, 0, w, h);
    }

    this.band(ctx, w, h, 0.4, 0.16, "rgba(255,255,255,0.30)", 0.16);
    this.band(ctx, w, h, 0.3, 0.2, "rgba(255,255,255,0.22)", 0.3);
    this.band(ctx, w, h, 0.2, 0.24, "rgba(255,255,255,0.16)", 0.5);

    if (this.hillFar) {
      ctx.fillStyle = "rgba(40,74,92,0.55)";
      ctx.fill(this.hillFar);
    }
    if (this.hillNear) {
      ctx.fillStyle = "rgba(24,48,64,0.78)";
      ctx.fill(this.hillNear);
    }

    if (this.hazeGrad) {
      ctx.fillStyle = this.hazeGrad;
      ctx.fillRect(0, h * 0.55, w, h * 0.45);
    }

    for (const bird of this.birds) {
      if (dt > 0) this.step(bird, dt);
      this.drawFlocker(ctx, bird, w, h);
    }

    if (dt > 0) this.heroT += dt;
    this.drawHero();
  }

  /* ------------------------------------------------------- hero bird layer */

  /**
   * The hero canvas (z-index 3, above the paper card) carries ONE big
   * canonical sunbird drifting through the OPEN part of the title screen —
   * the card is docked right on wide viewports, so the left sky is free;
   * on narrow viewports the card is centred and the hero uses the strip
   * above it. The card's own small SVG bird stays in the header; this one
   * is the "alive" background element. Under reduced motion the ambient
   * loop never runs, so this renders a single graceful static pose.
   */
  private drawHero(): void {
    const w = this.width;
    const h = this.height;
    const ctx = this.hctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    if (!this.heroActive || w < 2 || h < 2) return;
    const t = this.heroT;
    const wide = w >= 840; // same breakpoint that docks the card to the right
    const cx = wide
      ? w * (0.27 + 0.15 * Math.sin(t * 0.11))
      : w * (0.5 + 0.28 * Math.sin(t * 0.09));
    const cy = wide
      ? h * (0.36 + 0.09 * Math.sin(t * 0.07 + 1.3))
      : h * (0.08 + 0.035 * Math.sin(t * 0.13 + 2.1));
    const size = Math.min(w, h) * (wide ? 0.17 : 0.095);
    const flap = FLAP_NEUTRAL + Math.sin(t * 2.1) * 0.55;
    ctx.save();
    ctx.translate(cx, cy);
    drawSunbird(ctx, size, flap, 0.92);
    ctx.restore();
  }

  /* ---------------------------------------------------------- distant flock */

  private step(bird: Flocker, dt: number): void {
    bird.x += bird.speed * dt;
    if (bird.x > 1.12) {
      bird.x = -0.12;
      bird.y = 0.06 + bird.depth * 0.34 + Math.random() * 0.16;
    }
    bird.flap += bird.flapRate * dt;
  }

  private band(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    baseY: number,
    height: number,
    color: string,
    drift: number,
  ): void {
    const y = h * baseY;
    const offset = (this.time * drift) % 1;
    ctx.fillStyle = color;
    for (let i = -1; i < 4; i++) {
      const cx = (i + offset) * (w / 3);
      const cw = w * 0.42;
      const ch = h * height;
      ctx.beginPath();
      ctx.ellipse(cx, y, cw, ch, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawFlocker(ctx: CanvasRenderingContext2D, bird: Flocker, w: number, h: number): void {
    const x = bird.x * w;
    const y = bird.y * h + Math.sin(this.time * 0.9 + bird.flap * 0.15) * (h * 0.004);
    // The shared bird is `size` px WIDE (64 units end to end), where the old
    // menu-local one spanned ~1.81 * size. Scaled up to match, so the flock
    // reads exactly as big on screen as it did before the extraction.
    const size = Math.max(11, 16 * bird.scale);
    // Centred on FLAP_NEUTRAL, not on zero: that is the pose the title-screen
    // bird is drawn in, so a ±0.5 beat sweeps the wings symmetrically through
    // it instead of hanging below it for most of the cycle.
    const flap = FLAP_NEUTRAL + Math.sin(bird.flap) * 0.5;

    // Every flock member is the same sunbird: near ones show full plumage,
    // far ones fade toward a deep-orange silhouette so they still read as
    // the hero bird at a distance.
    const dim = 0.5 + bird.depth * 0.5;
    ctx.save();
    ctx.translate(x, y);
    // The one canonical bird — same shape as the lobby and roster birds.
    drawSunbird(ctx, size, flap, dim);
    ctx.restore();
  }
}
