/**
 * Real-time Performance Dashboard
 * 
 * Displays FPS, memory usage, draw calls, and other metrics
 * in a compact overlay for debugging and optimization.
 */

import type { Telemetry } from "./Telemetry";

export class PerformanceDashboard {
  private container: HTMLDivElement | null = null;
  private fpsElement: HTMLDivElement | null = null;
  private memoryElement: HTMLDivElement | null = null;
  private drawCallsElement: HTMLDivElement | null = null;
  private frameTimeElement: HTMLDivElement | null = null;
  private visible = false;
  private updateInterval: number | null = null;

  constructor(private telemetry: Telemetry) {}

  /** Create the dashboard UI */
  create(): void {
    if (this.container) return;

    this.container = document.createElement("div");
    this.container.id = "performance-dashboard";
    this.container.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.8);
      color: #fff;
      padding: 12px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 12px;
      z-index: 9999;
      pointer-events: none;
      min-width: 180px;
    `;

    this.fpsElement = document.createElement("div");
    this.fpsElement.style.marginBottom = "4px";
    this.container.appendChild(this.fpsElement);

    this.frameTimeElement = document.createElement("div");
    this.frameTimeElement.style.marginBottom = "4px";
    this.container.appendChild(this.frameTimeElement);

    this.memoryElement = document.createElement("div");
    this.memoryElement.style.marginBottom = "4px";
    this.container.appendChild(this.memoryElement);

    this.drawCallsElement = document.createElement("div");
    this.container.appendChild(this.drawCallsElement);

    document.body.appendChild(this.container);
    this.visible = true;
  }

  /** Show the dashboard */
  show(): void {
    if (!this.container) this.create();
    if (this.container) {
      this.container.style.display = "block";
      this.visible = true;
      this.startUpdates();
    }
  }

  /** Hide the dashboard */
  hide(): void {
    if (this.container) {
      this.container.style.display = "none";
      this.visible = false;
      this.stopUpdates();
    }
  }

  /** Toggle visibility */
  toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }

  /** Start updating metrics */
  private startUpdates(): void {
    if (this.updateInterval) return;
    this.updateInterval = window.setInterval(() => this.update(), 500);
  }

  /** Stop updating metrics */
  private stopUpdates(): void {
    if (this.updateInterval) {
      window.clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /** Update displayed metrics */
  private update(): void {
    const metrics = this.telemetry.getAverageMetrics(2);
    
    if (this.fpsElement) {
      const fps = Math.round(metrics.fps);
      const color = fps >= 50 ? "#4ade80" : fps >= 30 ? "#fbbf24" : "#ef4444";
      this.fpsElement.innerHTML = `<span style="color:${color}">FPS: ${fps}</span>`;
    }

    if (this.frameTimeElement) {
      const frameTime = metrics.frameTime.toFixed(1);
      this.frameTimeElement.textContent = `Frame: ${frameTime}ms`;
    }

    if (this.memoryElement) {
      const used = (metrics.memoryUsed / 1024 / 1024).toFixed(1);
      const total = (metrics.memoryTotal / 1024 / 1024).toFixed(1);
      this.memoryElement.textContent = `Memory: ${used}/${total}MB`;
    }

    if (this.drawCallsElement) {
      this.drawCallsElement.textContent = `Draw calls: ${Math.round(metrics.drawCalls)}`;
    }
  }

  /** Clean up */
  dispose(): void {
    this.stopUpdates();
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }
}

export default PerformanceDashboard;
