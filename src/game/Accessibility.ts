/**
 * Accessibility utilities for Sunbird game.
 *
 * Features:
 * - Reduced motion support
 * - High contrast mode
 * - Screen reader announcements
 * - Keyboard navigation helpers
 * - Color contrast validation
 */

export type AccessibilitySettings = {
  reduceMotion: boolean;
  highContrast: boolean;
  screenReader: boolean;
  keyboardNavigation: boolean;
  fontSize: "small" | "medium" | "large";
};

const STORAGE_KEY = "sunbird.accessibility";

export class Accessibility {
  private settings: AccessibilitySettings = {
    reduceMotion: false,
    highContrast: false,
    screenReader: false,
    keyboardNavigation: false,
    fontSize: "medium",
  };

  private liveRegion: HTMLElement | null = null;

  constructor() {
    this.load();
    this.setupMediaQueries();
    this.setupKeyboardDetection();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AccessibilitySettings>;
        this.settings = { ...this.settings, ...parsed };
      }
    } catch {
      // Ignore load errors
    }

    // Auto-detect system preferences
    if (window.matchMedia) {
      this.settings.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.settings.highContrast = window.matchMedia("(prefers-contrast: high)").matches;
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Ignore save errors
    }
  }

  private setupMediaQueries(): void {
    if (!window.matchMedia) return;

    // Listen for reduced motion changes
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    motionQuery.addEventListener("change", (e) => {
      this.settings.reduceMotion = e.matches;
      this.save();
    });

    // Listen for contrast changes
    const contrastQuery = window.matchMedia("(prefers-contrast: high)");
    contrastQuery.addEventListener("change", (e) => {
      this.settings.highContrast = e.matches;
      this.save();
    });
  }

  private setupKeyboardDetection(): void {
    // Detect keyboard navigation (Tab key usage)
    let isUsingKeyboard = false;

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Tab") {
        isUsingKeyboard = true;
        this.settings.keyboardNavigation = true;
        document.body.classList.add("keyboard-nav");
      }
    };

    const handleMouseDown = (): void => {
      if (isUsingKeyboard) {
        isUsingKeyboard = false;
        document.body.classList.remove("keyboard-nav");
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleMouseDown);

    // Detect screen reader (aria-live presence indicates SR)
    this.liveRegion = document.createElement("div");
    this.liveRegion.setAttribute("aria-live", "polite");
    this.liveRegion.setAttribute("aria-atomic", "true");
    this.liveRegion.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)";
    document.body.appendChild(this.liveRegion);
    this.settings.screenReader = true;
  }

  /** Get current accessibility settings */
  getSettings(): Readonly<AccessibilitySettings> {
    return this.settings;
  }

  /** Check if reduced motion is enabled */
  isReducedMotion(): boolean {
    return this.settings.reduceMotion;
  }

  /** Check if high contrast mode is enabled */
  isHighContrast(): boolean {
    return this.settings.highContrast;
  }

  /** Update settings */
  updateSettings(settings: Partial<AccessibilitySettings>): void {
    this.settings = { ...this.settings, ...settings };
    this.save();
    this.applySettings();
  }

  /** Apply settings to the game */
  applySettings(): void {
    // Apply reduced motion
    if (this.settings.reduceMotion) {
      document.body.classList.add("reduced-motion");
    } else {
      document.body.classList.remove("reduced-motion");
    }

    // Apply high contrast
    if (this.settings.highContrast) {
      document.body.classList.add("high-contrast");
    } else {
      document.body.classList.remove("high-contrast");
    }

    // Apply font size
    document.body.style.fontSize = {
      small: "14px",
      medium: "16px",
      large: "18px",
    }[this.settings.fontSize];

    // Apply keyboard navigation
    if (this.settings.keyboardNavigation) {
      document.body.classList.add("keyboard-nav");
    }
  }

  /** Announce to screen readers */
  announce(message: string, priority: "polite" | "assertive" = "polite"): void {
    if (!this.liveRegion) return;

    this.liveRegion.setAttribute("aria-live", priority);
    this.liveRegion.textContent = "";

    // Brief delay to ensure screen readers pick up the change
    requestAnimationFrame(() => {
      if (this.liveRegion) {
        this.liveRegion.textContent = message;
      }
    });
  }

  /** Get animation duration based on motion settings */
  getAnimationDuration(ms: number): number {
    return this.settings.reduceMotion ? 0 : ms;
  }

  /** Get animation scale based on motion settings */
  getAnimationScale(scale: number): number {
    return this.settings.reduceMotion ? 1 : scale;
  }

  /** Check if element has sufficient color contrast (WCAG AA) */
  static checkContrast(foreground: string, background: string): boolean {
    const getLuminance = (color: string): number => {
      const hex = color.replace("#", "");
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;

      const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

      return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    };

    const l1 = getLuminance(foreground);
    const l2 = getLuminance(background);
    const contrast = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

    // WCAG AA requires 4.5:1 for normal text, 3:1 for large text
    return contrast >= 4.5;
  }

  /** Generate accessible focus styles */
  static getFocusStyles(): string {
    return `
      outline: 3px solid #ff7a45;
      outline-offset: 2px;
      box-shadow: 0 0 0 4px rgba(255, 122, 69, 0.3);
    `;
  }

  /** Add keyboard event listeners to an element for button-like behavior */
  static makeKeyboardAccessible(
    element: HTMLElement,
    onClick: () => void,
    label?: string,
  ): void {
    if (label) {
      element.setAttribute("role", "button");
      element.setAttribute("aria-label", label);
    }

    element.setAttribute("tabindex", "0");

    element.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    });
  }
}

export default Accessibility;
