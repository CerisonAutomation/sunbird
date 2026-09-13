/**
 * Keyboard Navigation System
 * 
 * Adds keyboard navigation support for menus and UI elements.
 * Enables Tab, Enter, Escape, and Arrow key navigation.
 */

export class KeyboardNavigation {
  private enabled = false;
  private currentFocus: HTMLElement | null = null;
  private focusableElements: HTMLElement[] = [];

  constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleFocusIn = this.handleFocusIn.bind(this);
  }

  /** Enable keyboard navigation */
  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    document.addEventListener("keydown", this.handleKeyDown);
    document.addEventListener("focusin", this.handleFocusIn);
    document.body.classList.add("keyboard-nav");
  }

  /** Disable keyboard navigation */
  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    document.removeEventListener("keydown", this.handleKeyDown);
    document.removeEventListener("focusin", this.handleFocusIn);
    document.body.classList.remove("keyboard-nav");
  }

  /** Update focusable elements list */
  updateFocusableElements(): void {
    this.focusableElements = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button, [tabindex], a, input, select, textarea, [data-ui]'
      )
    ).filter((el) => !el.hidden && el.offsetParent !== null);
  }

  /** Handle keydown events */
  private handleKeyDown(e: KeyboardEvent): void {
    // Only handle keyboard navigation when not in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    this.updateFocusableElements();

    switch (e.key) {
      case "Tab":
        e.preventDefault();
        this.handleTab(e.shiftKey);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        this.activateCurrentElement();
        break;
      case "Escape":
        e.preventDefault();
        this.handleEscape();
        break;
      case "ArrowDown":
      case "ArrowRight":
        e.preventDefault();
        this.moveFocus(1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        e.preventDefault();
        this.moveFocus(-1);
        break;
    }
  }

  /** Handle Tab key navigation */
  private handleTab(reverse: boolean): void {
    if (this.focusableElements.length === 0) return;

    const currentIndex = this.focusableElements.indexOf(this.currentFocus!);
    let nextIndex: number;

    if (reverse) {
      nextIndex = currentIndex <= 0 ? this.focusableElements.length - 1 : currentIndex - 1;
    } else {
      nextIndex = currentIndex >= this.focusableElements.length - 1 ? 0 : currentIndex + 1;
    }

    this.focusElement(this.focusableElements[nextIndex]!);
  }

  /** Move focus by direction */
  private moveFocus(direction: number): void {
    if (this.focusableElements.length === 0) return;

    const currentIndex = this.focusableElements.indexOf(this.currentFocus!);
    let nextIndex = currentIndex + direction;

    if (nextIndex < 0) nextIndex = this.focusableElements.length - 1;
    if (nextIndex >= this.focusableElements.length) nextIndex = 0;

    this.focusElement(this.focusableElements[nextIndex]!);
  }

  /** Focus an element */
  private focusElement(element: HTMLElement): void {
    if (this.currentFocus) {
      this.currentFocus.classList.remove("keyboard-focused");
    }
    this.currentFocus = element;
    element.focus();
    element.classList.add("keyboard-focused");
  }

  /** Activate current focused element */
  private activateCurrentElement(): void {
    if (!this.currentFocus) return;
    
    if (this.currentFocus.tagName === "BUTTON") {
      this.currentFocus.click();
    } else if (this.currentFocus.hasAttribute("data-action")) {
      this.currentFocus.click();
    }
  }

  /** Handle Escape key */
  private handleEscape(): void {
    // Find and click back/close button
    const backButtons = document.querySelectorAll<HTMLElement>(
      '[data-action="back"], [data-action="menu"], .close-btn'
    );
    if (backButtons.length > 0) {
      backButtons[0]!.click();
    }
  }

  /** Handle focusin events */
  private handleFocusIn(e: FocusEvent): void {
    const target = e.target as HTMLElement;
    if (target && this.focusableElements.includes(target)) {
      this.currentFocus = target;
    }
  }

  /** Clean up */
  dispose(): void {
    this.disable();
  }
}

export default KeyboardNavigation;
