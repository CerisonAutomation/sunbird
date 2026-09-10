/**
 * MenuSky — the living "birds in motion" background for the shell.
 *
 * Deliberately cheap: one 2D canvas, a fixed small flock (no particle spam),
 * capped device pixel ratio, and ~30 Hz ambient update. It pauses completely
 * when the menu is not visible and renders a single static frame under
 * `prefers-reduced-motion`. This is decorative-only and never touches the
 * 3D scene or gameplay.
 */

type Bird = {
  x: number;
  y: number;
  scale: number;
  speed: number;
  flap: number;
  flapRate: number;
  drift: number;
  depth: number;
};

const FLOCK_SIZE = 14;

export class MenuSky {
  readonly host: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly birds: Bird[] = [];
  private readonly reduceMotion: boolean;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private time = 0;
  private active = false;
  private width = 1;
  private height = 1;
  private dpr = 1;

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
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.width = width;
    this.height = height;
    this.canvas.width = Math.floor(width * this.dpr);
    this.canvas.height = Math.floor(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (!this.active || this.reduceMotion) this.draw(0);
  }

  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    this.host.classList.toggle("on", active);
    if (active && !this.reduceMotion) this.start();
    else this.stop();
    if (active) this.draw(0);
  }

  dispose(): void {
    this.stop();
    this.host.remove();
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

  private draw(dt: number): void {
    const w = this.width;
    const h = this.height;
    const ctx = this.ctx;

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#1d3f6b");
    sky.addColorStop(0.36, "#4f86bd");
    sky.addColorStop(0.62, "#9cc9e6");
    sky.addColorStop(0.82, "#f0c9a0");
    sky.addColorStop(1, "#f6b96f");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Low sun with a soft bloom — the game's daylight fantasy.
    const sunX = w * 0.76;
    const sunY = h * 0.34;
    const bloom = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, h * 0.5);
    bloom.addColorStop(0, "rgba(255, 244, 205, 0.95)");
    bloom.addColorStop(0.16, "rgba(255, 226, 150, 0.5)");
    bloom.addColorStop(1, "rgba(255, 200, 120, 0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, w, h);

    this.band(ctx, w, h, 0.4, 0.16, 0.34, "rgba(255,255,255,0.30)", 0.16);
    this.band(ctx, w, h, 0.3, 0.2, 0.22, "rgba(255,255,255,0.22)", 0.3);
    this.band(ctx, w, h, 0.2, 0.24, 0.14, "rgba(255,255,255,0.16)", 0.5);

    this.hills(ctx, w, h, 0.66, "rgba(40,74,92,0.55)", 1.1, 2.1);
    this.hills(ctx, w, h, 0.76, "rgba(24,48,64,0.78)", 0.8, 4.3);

    // Foreground haze to seat the flock in the sky.
    const haze = ctx.createLinearGradient(0, h * 0.55, 0, h);
    haze.addColorStop(0, "rgba(255, 214, 160, 0)");
    haze.addColorStop(1, "rgba(255, 198, 138, 0.22)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, h * 0.55, w, h * 0.45);

    for (const bird of this.birds) {
      if (dt > 0) this.step(bird, dt);
      this.drawBird(ctx, bird, w, h);
    }
  }

  private step(bird: Bird, dt: number): void {
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
    alpha: number,
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
    void alpha;
  }

  private hills(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    baseY: number,
    color: string,
    amp: number,
    freq: number,
  ): void {
    const y0 = h * baseY;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 14) {
      const t = x / w;
      const y = y0 - Math.sin(t * Math.PI * freq + freq) * (h * 0.03 * amp) - Math.sin(t * 9.1) * (h * 0.012 * amp);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }

  private drawBird(ctx: CanvasRenderingContext2D, bird: Bird, w: number, h: number): void {
    const x = bird.x * w;
    const y = bird.y * h + Math.sin(this.time * 0.9 + bird.flap * 0.15) * (h * 0.004);
    const size = 8 * bird.scale;
    const flap = Math.sin(bird.flap) * 0.7;
    const shade = 0.42 + bird.depth * 0.3;
    ctx.strokeStyle = `rgba(28, 42, 62, ${shade})`;
    ctx.lineWidth = Math.max(1.2, size * 0.16);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - size, y + flap * size * 0.42);
    ctx.quadraticCurveTo(x - size * 0.4, y - size * 0.3, x, y);
    ctx.quadraticCurveTo(x + size * 0.4, y - size * 0.3, x + size, y + flap * size * 0.42);
    ctx.stroke();
  }
}
