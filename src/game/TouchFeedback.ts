/**
 * Touch Feedback System
 * 
 * Provides visual feedback for touch interactions on mobile devices.
 * Shows ripple effects, highlights, and haptic-like visual cues.
 */

export class TouchFeedback {
  private container: HTMLDivElement | null = null;
  private enabled = true;

  constructor() {
    this.createContainer();
  }

  /** Create the feedback container */
  private createContainer(): void {
    this.container = document.createElement("div");
    this.container.id = "touch-feedback-container";
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 10000;
    `;
    document.body.appendChild(this.container);
  }

  /** Show ripple effect at position */
  showRipple(x: number, y: number, color = "rgba(255, 255, 255, 0.3)"): void {
    if (!this.enabled || !this.container) return;

    const ripple = document.createElement("div");
    ripple.style.cssText = `
      position: absolute;
      left: ${x}px;
      top: ${y}px;
      width: 0;
      height: 0;
      border-radius: 50%;
      background: ${color};
      transform: translate(-50%, -50%);
      animation: ripple-expand 0.4s ease-out forwards;
    `;

    this.container.appendChild(ripple);

    // Remove after animation
    setTimeout(() => {
      ripple.remove();
    }, 400);
  }

  /** Show highlight effect on element */
  showHighlight(element: HTMLElement, duration = 200): void {
    if (!this.enabled) return;

    const originalBackground = element.style.background;
    element.style.background = "rgba(255, 255, 255, 0.2)";
    element.style.transition = "background 0.1s";

    setTimeout(() => {
      element.style.background = originalBackground;
    }, duration);
  }

  /** Show press effect (scale down) */
  showPress(element: HTMLElement, duration = 100): void {
    if (!this.enabled) return;

    element.style.transform = "scale(0.95)";
    element.style.transition = "transform 0.1s";

    setTimeout(() => {
      element.style.transform = "";
    }, duration);
  }

  /** Enable feedback */
  enable(): void {
    this.enabled = true;
  }

  /** Disable feedback */
  disable(): void {
    this.enabled = false;
  }

  /** Clean up */
  dispose(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }
}

// Add CSS animation for ripple
const style = document.createElement("style");
style.textContent = `
  @keyframes ripple-expand {
    0% {
      width: 0;
      height: 0;
      opacity: 1;
    }
    100% {
      width: 100px;
      height: 100px;
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

export default TouchFeedback;
