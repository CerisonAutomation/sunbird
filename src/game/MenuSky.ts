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

const FLOCK_SIZE = 18;
const TRAIL_LEN = 16;

export class MenuSky {
  readonly host: HTMLDivElement;
  /** Transparent overlay canvas that draws the hero bird ABOVE the UI card. */
  readonly heroHost: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly heroCanvas: HTMLCanvasElement;
  private readonly hctx: CanvasRenderingContext2D;
  private readonly birds: Flocker[] = [];
  private readonly reduceMotion: boolean;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private time = 0;
  private active = false;
  private width = 1;
  private height = 1;
  private dpr = 1;

  // Cached per-resize scenery (rebuilt only when the canvas really changes).
  private skyGrad: CanvasGradient | null = null;
  private bloomGrad: CanvasGradient | null = null;
  private hazeGrad: CanvasGradient | null = null;
  private hillFar: Path2D | null = null;
  private hillNear: Path2D | null = null;

  // Hero sunbird — the player's bird swooping through its own menu sky.
  private readonly trail: { x: number; y: number }[] = [];
  private heroFlap = 0;

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
    this.ctx = this.canvas.getContext("2d")!;

    this.heroHost = document.createElement("div");
    this.heroHost.className = "menu-hero-layer";
    this.heroHost.setAttribute("aria-hidden", "true");
    this.heroCanvas = document.createElement("canvas");
    this.heroCanvas.className = "menu-sky-canvas";
    this.heroHost.appendChild(this.heroCanvas);
    this.hctx = this.heroCanvas.getContext("2d")!;

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
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.heroCanvas.width = Math.floor(width * dpr);
    this.heroCanvas.height = Math.floor(height * dpr);
    this.heroCanvas.style.width = `${width}px`;
    this.heroCanvas.style.height = `${height}px`;
    this.hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.buildScenery();
    // Paint immediately so a resize never leaves a blank frame behind.
    this.draw(0);
  }

  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    this.host.classList.toggle("on", active);
    this.heroHost.classList.toggle("on", active);
    if (active && !this.reduceMotion) this.start();
    else this.stop();
    if (active) this.draw(0);
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
    const { ctx, width: w, height: h } = this;

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#1d3f6b");
    sky.addColorStop(0.36, "#4f86bd");
    sky.addColorStop(0.62, "#9cc9e6");
    sky.addColorStop(0.82, "#f0c9a0");
    sky.addColorStop(1, "#f6b96f");
    this.skyGrad = sky;

    const sunX = w * 0.76;
    const sunY = h * 0.34;
    const bloom = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, h * 0.5);
    bloom.addColorStop(0, "rgba(255, 244, 205, 0.95)");
    bloom.addColorStop(0.16, "rgba(255, 226, 150, 0.5)");
    bloom.addColorStop(1, "rgba(255, 200, 120, 0)");
    this.bloomGrad = bloom;

    const haze = ctx.createLinearGradient(0, h * 0.55, 0, h);
    haze.addColorStop(0, "rgba(255, 214, 160, 0)");
    haze.addColorStop(1, "rgba(255, 198, 138, 0.22)");
    this.hazeGrad = haze;

    this.hillFar = this.buildHill(0.66, 1.1, 2.1);
    this.hillNear = this.buildHill(0.76, 0.8, 4.3);
  }

  private buildHill(baseY: number, amp: number, freq: number): Path2D {
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
    if (!this.skyGrad) this.buildScenery();

    ctx.fillStyle = this.skyGrad!;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = this.bloomGrad!;
    ctx.fillRect(0, 0, w, h);

    this.band(ctx, w, h, 0.4, 0.16, "rgba(255,255,255,0.30)", 0.16);
    this.band(ctx, w, h, 0.3, 0.2, "rgba(255,255,255,0.22)", 0.3);
    this.band(ctx, w, h, 0.2, 0.24, "rgba(255,255,255,0.16)", 0.5);

    ctx.fillStyle = "rgba(40,74,92,0.55)";
    ctx.fill(this.hillFar!);
    ctx.fillStyle = "rgba(24,48,64,0.78)";
    ctx.fill(this.hillNear!);

    ctx.fillStyle = this.hazeGrad!;
    ctx.fillRect(0, h * 0.55, w, h * 0.45);

    for (const bird of this.birds) {
      if (dt > 0) this.step(bird, dt);
      this.drawFlocker(ctx, bird, w, h);
    }

    // Hero flies on its own transparent overlay so it soars OVER the UI card.
    this.hctx.clearRect(0, 0, w, h);
    this.drawHero(this.hctx, w, h, dt);
  }

  /* ------------------------------------------------------------- hero bird */

  /**
   * One sunbird shape used for both the big hero and every member of the
   * distant flock, so the small birds flying around read as the same bird —
   * orange body, cream belly, gold beak — just scaled and dimmed by depth.
   * Draws centered on the origin, facing +x. `dim` fades 1 (near, full colour)
   * toward a deeper silhouette for the far birds.
   */
  private drawSunbird(ctx: CanvasRenderingContext2D, size: number, flap: number, dim: number): void {
    const f = Math.max(0.35, Math.min(1, dim));
    const tint = (hex: string, m = 1): string => {
      const n = parseInt(hex.slice(1), 16);
      const r = Math.round(((n >> 16) & 255) * f * m);
      const g = Math.round(((n >> 8) & 255) * f * m);
      const b = Math.round((n & 255) * f * m);
      return `rgb(${r},${g},${b})`;
    };

    // Far wing (behind the body, slightly darker).
    ctx.fillStyle = tint("#e06a35", 0.92);
    ctx.beginPath();
    ctx.ellipse(-size * 0.05, -size * 0.16 - flap * size * 0.34, size * 0.5, size * 0.2, -0.5 - flap * 0.35, 0, Math.PI * 2);
    ctx.fill();

    // Body.
    ctx.fillStyle = tint("#ff7a45");
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.62, size * 0.4, 0.06, 0, Math.PI * 2);
    ctx.fill();

    // Belly.
    ctx.fillStyle = tint("#ffe6c4");
    ctx.beginPath();
    ctx.ellipse(size * 0.1, size * 0.14, size * 0.36, size * 0.2, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // Tail feathers.
    ctx.fillStyle = tint("#e06a35");
    ctx.beginPath();
    ctx.moveTo(-size * 0.5, 0);
    ctx.lineTo(-size * 0.95, -size * 0.18);
    ctx.lineTo(-size * 0.85, size * 0.12);
    ctx.closePath();
    ctx.fill();

    // Near wing (banks with the flap).
    ctx.fillStyle = tint("#ff9a62");
    ctx.beginPath();
    ctx.ellipse(size * 0.02, -size * 0.05 - flap * size * 0.42, size * 0.56, size * 0.24, -0.35 - flap * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Beak.
    ctx.fillStyle = tint("#ffb020");
    ctx.beginPath();
    ctx.moveTo(size * 0.58, -size * 0.06);
    ctx.lineTo(size * 0.86, size * 0.02);
    ctx.lineTo(size * 0.56, size * 0.12);
    ctx.closePath();
    ctx.fill();

    // Eye only when large enough to read; tiny distant birds stay clean.
    if (size >= 14) {
      ctx.fillStyle = tint("#2a1c28");
      ctx.beginPath();
      ctx.arc(size * 0.36, -size * 0.1, size * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tint("#ffffff");
      ctx.beginPath();
      ctx.arc(size * 0.385, -size * 0.125, size * 0.025, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * The hero sunbird swoops along a slow figure-of-eight (two incommensurate
   * sines, so the path never visibly repeats), banking into turns and leaving
   * a short ember trail — the menu shows the bird you actually fly.
   */
  private heroPos(t: number): { x: number; y: number } {
    // Stay in the top band of the screen: full-width sweeps, but never lower
    // than ~32% down so the bird plays around the logo, not over body copy.
    return {
      x: 0.5 + 0.4 * Math.sin(t * 0.21) + 0.07 * Math.sin(t * 0.53 + 1.2),
      y: 0.16 + 0.1 * Math.sin(t * 0.42 + 0.8) + 0.05 * Math.sin(t * 0.17),
    };
  }

  /**
   * The hero bird's screen position (canvas pixels). It orbits the hero sun
   * so the menu reads as "one sunbird on the sun" — the way players remember
   * it. When the sun isn't on screen (a sub-menu), fall back to the classic
   * wide figure-of-eight sweep.
   */
  private heroPoint(t: number): { x: number; y: number } {
    const sun = this.sunCenter();
    if (sun) {
      return {
        x: sun.x + Math.sin(t * 0.55) * 46 + Math.sin(t * 0.93 + 2.1) * 16,
        y: sun.y + Math.cos(t * 0.5 + 1.1) * 28 + Math.sin(t * 0.71) * 12,
      };
    }
    const p = this.heroPos(t);
    return { x: p.x * this.width, y: p.y * this.height };
  }

  /** Centre of the `.hero-sun` element in hero-canvas pixels, or null. */
  private sunCenter(): { x: number; y: number } | null {
    const sun = this.heroHost.parentElement?.querySelector<HTMLElement>(".hero-sun");
    if (!sun || sun.offsetWidth === 0 || sun.offsetHeight === 0) return null;
    const heroRect = this.heroCanvas.getBoundingClientRect();
    const sunRect = sun.getBoundingClientRect();
    if (heroRect.width === 0 || sunRect.width === 0) return null;
    return {
      x: sunRect.left + sunRect.width / 2 - heroRect.left,
      y: sunRect.top + sunRect.height / 2 - heroRect.top,
    };
  }

  private drawHero(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number): void {
    const t = this.reduceMotion ? 4.2 : this.time;
    const p = this.heroPoint(t);
    const ahead = this.heroPoint(t + 0.12);
    const vx = ahead.x - p.x;
    const vy = ahead.y - p.y;
    const heading = Math.atan2(vy, vx);
    const dirRight = Math.cos(heading) >= 0;

    const x = p.x;
    const y = p.y;
    const size = Math.max(22, Math.min(w, h) * 0.06);

    if (dt > 0) {
      this.heroFlap += dt * (7 + Math.abs(Math.sin(t * 0.42)) * 4);
      this.trail.push({ x, y });
      if (this.trail.length > TRAIL_LEN) this.trail.shift();
    }

    // Ember trail — fading, shrinking dots along the recent path.
    for (let i = 0; i < this.trail.length; i++) {
      const k = i / TRAIL_LEN;
      const tp = this.trail[i]!;
      ctx.fillStyle = `rgba(255, 190, 110, ${0.05 + k * 0.2})`;
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, size * 0.1 + k * size * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading * 0.5); // soften banking so it never looks acrobatic
    if (!dirRight) ctx.scale(-1, 1);
    const flap = Math.sin(this.heroFlap) * 0.85;
    this.drawSunbird(ctx, size, flap, 1);
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
    const size = Math.max(6, 9 * bird.scale);
    const flap = Math.sin(bird.flap) * 0.7;

    // Every flock member is the same sunbird: near ones show full plumage,
    // far ones fade toward a deep-orange silhouette so they still read as
    // the hero bird at a distance.
    const dim = 0.5 + bird.depth * 0.5;
    ctx.save();
    ctx.translate(x, y);
    this.drawSunbird(ctx, size, flap, dim);
    ctx.restore();
  }
}
