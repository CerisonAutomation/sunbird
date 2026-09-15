import { hiddenByDisclosure } from "./Disclosure";
/** Native dialog keyboard behavior for the game's DOM overlays. */
export class OverlayNavigation {
  private active: HTMLElement | null = null;
  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.key !== "Tab" || !this.active) return;
    const controls = [...this.active.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
    )].filter(el => {
      return !hiddenByDisclosure(el)
        && el.getClientRects().length > 0 && !el.closest("[inert]");
    });
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first || !last) { event.preventDefault(); return; }
    const current = document.activeElement;
    if (event.shiftKey && (current === first || !controls.includes(current as HTMLElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (current === last || !controls.includes(current as HTMLElement))) {
      event.preventDefault(); first.focus();
    }
  };

  constructor(private readonly root: HTMLElement) { root.addEventListener("keydown", this.onKey); }

  sync(active: HTMLElement | null): void {
    for (const overlay of this.root.querySelectorAll<HTMLElement>(".overlay, .matchmaking")) {
      const inert = overlay !== active;
      if (overlay.inert !== inert) overlay.inert = inert;
    }
    const play = this.root.querySelector<HTMLElement>(".play-hud");
    if (play && play.inert !== (active !== null)) play.inert = active !== null;
    if (active) {
      if (active.getAttribute("role") !== "dialog") active.setAttribute("role", "dialog");
      if (active.getAttribute("aria-modal") !== "true") active.setAttribute("aria-modal", "true");
      const heading = active.querySelector<HTMLElement>("h1, h2");
      const label = heading?.textContent || (active.classList.contains("matchmaking") ? "Finding a race" : "Sunbird");
      if (active.getAttribute("aria-label") !== label) active.setAttribute("aria-label", label);
      if (active !== this.active) {
        if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
        else active.querySelector<HTMLElement>("button:not(:disabled)")?.focus({ preventScroll: true });
      }
    } else if (this.active) {
      // Return gameplay keys to the canvas, not a hidden Resume button.
      const canvas = this.root.parentElement?.querySelector("canvas");
      if (canvas) { canvas.tabIndex = -1; canvas.focus({ preventScroll: true }); }
    }
    this.active = active;
  }

  dispose(): void { this.root.removeEventListener("keydown", this.onKey); this.active = null; }
}
