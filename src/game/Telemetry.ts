type Props = Record<string, string | number | boolean>;
type Entry = { name: string; props: Props; t: number };

export type PerformanceMetrics = {
  fps: number;
  frameTime: number;
  memoryUsed: number;
  memoryTotal: number;
  drawCalls: number;
  triangles: number;
};

/** Lightweight analytics bus with performance monitoring. Forwards to window.dataLayer when present. */
export class Telemetry {
  private readonly buffer: Entry[] = [];
  private readonly debug =
    typeof location !== "undefined" && /localhost|127\.0\.0\.1/.test(location.hostname);
  private hookInstalled = false;

  // Performance monitoring
  private frameCount = 0;
  private lastFpsUpdate = 0;
  private currentFps = 0;
  private frameTimes: number[] = [];
  private metricsHistory: PerformanceMetrics[] = [];
  private static readonly MAX_METRICS_HISTORY = 60;

  private readonly onHide = (): void => {
    if (document.visibilityState === "hidden") this.flush();
  };

  /** Send buffered events and install the visibility flush hook. */
  flush(): void {
    if (!this.hookInstalled && typeof document !== "undefined") {
      this.hookInstalled = true;
      document.addEventListener("visibilitychange", this.onHide);
    }
  }

  /** Detach the flush hook — Game.dispose() calls this so React StrictMode's
   * double-mount never leaves a zombie listener double-beaconing events. */
  dispose(): void {
    if (!this.hookInstalled || typeof document === "undefined") return;
    this.hookInstalled = false;
    document.removeEventListener("visibilitychange", this.onHide);
  }

  track(name: string, props: Props = {}): void {
    const entry: Entry = { name, props, t: Date.now() };
    this.buffer.push(entry);
    if (this.buffer.length > 100) this.buffer.shift();
    const w = window as unknown as { dataLayer?: unknown[] };
    w.dataLayer?.push({ event: name, ...props });
    if (this.debug) console.debug("[telemetry]", name, props);
  }

  recent(): readonly Entry[] {
    return this.buffer;
  }

  /** Track frame timing for FPS calculation */
  trackFrame(): void {
    const now = performance.now();
    this.frameTimes.push(now);

    // Keep only last second of frame times
    while (this.frameTimes.length > 0 && this.frameTimes[0]! < now - 1000) {
      this.frameTimes.shift();
    }

    this.currentFps = this.frameTimes.length;
    this.frameCount++;

    // Update metrics every second
    if (now - this.lastFpsUpdate >= 1000) {
      this.lastFpsUpdate = now;
      this.collectMetrics();
    }
  }

  /** Collect current performance metrics */
  private collectMetrics(): void {
    const perf = performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } };
    const memory = perf.memory;

    const metrics: PerformanceMetrics = {
      fps: this.currentFps,
      frameTime: this.frameTimes.length > 1
        ? (this.frameTimes[this.frameTimes.length - 1]! - this.frameTimes[0]!) / (this.frameTimes.length - 1)
        : 0,
      memoryUsed: memory?.usedJSHeapSize ?? 0,
      memoryTotal: memory?.jsHeapSizeLimit ?? 0,
      drawCalls: 0, // Will be updated by renderer
      triangles: 0, // Will be updated by renderer
    };

    this.metricsHistory.push(metrics);
    if (this.metricsHistory.length > Telemetry.MAX_METRICS_HISTORY) {
      this.metricsHistory.shift();
    }

    // Track performance issues
    if (this.currentFps < 30) {
      this.track("performance_warning", {
        fps: this.currentFps,
        memory: metrics.memoryUsed,
        severity: this.currentFps < 20 ? "critical" : "warning",
      });
    }
  }

  /** Update renderer stats (call from game loop after renderer.render()) */
  updateRendererStats(renderer: { info: { render: { calls: number; triangles: number } } }): void {
    const lastMetrics = this.metricsHistory[this.metricsHistory.length - 1];
    if (lastMetrics) {
      lastMetrics.drawCalls = renderer.info.render.calls;
      lastMetrics.triangles = renderer.info.render.triangles;
    }
  }

  /** Get current FPS */
  getFps(): number {
    return this.currentFps;
  }

  /** Get performance metrics history */
  getMetricsHistory(): readonly PerformanceMetrics[] {
    return this.metricsHistory;
  }

  /** Get average metrics over last N seconds */
  getAverageMetrics(_seconds = 5): PerformanceMetrics {
    const recent = this.metricsHistory;

    if (recent.length === 0) {
      return { fps: 0, frameTime: 0, memoryUsed: 0, memoryTotal: 0, drawCalls: 0, triangles: 0 };
    }

    return {
      fps: recent.reduce((sum, m) => sum + m.fps, 0) / recent.length,
      frameTime: recent.reduce((sum, m) => sum + m.frameTime, 0) / recent.length,
      memoryUsed: recent[recent.length - 1]!.memoryUsed,
      memoryTotal: recent[recent.length - 1]!.memoryTotal,
      drawCalls: recent.reduce((sum, m) => sum + m.drawCalls, 0) / recent.length,
      triangles: recent.reduce((sum, m) => sum + m.triangles, 0) / recent.length,
    };
  }
}
