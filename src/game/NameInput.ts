export type NameInputState = {
  isOpen: boolean;
  name: string;
  isValid: boolean;
  isSubmitting: boolean;
  error: string | null;
};

export class NameInput {
  private state: NameInputState = {
    isOpen: false,
    name: '',
    isValid: false,
    isSubmitting: false,
    error: null,
  };

  private container: HTMLDivElement | null = null;
  private input: HTMLInputElement | null = null;
  private submitButton: HTMLButtonElement | null = null;
  private onChange: ((name: string) => void) | null = null;
  private onSubmit: ((name: string) => void) | null = null;

  create(options: {
    onChange?: (name: string) => void;
    onSubmit?: (name: string) => void;
  }): void {
    this.onChange = options.onChange || null;
    this.onSubmit = options.onSubmit || null;

    this.container = document.createElement('div');
    this.container.id = 'name-input-modal';
    this.container.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(20, 16, 40, 0.72);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: max(40px, env(safe-area-inset-top, 0px) + 24px);
      padding-bottom: env(safe-area-inset-bottom, 0px);
      overflow-y: auto;
      z-index: 10000;
      opacity: 0;
      transition: opacity 0.25s ease;
      -webkit-overflow-scrolling: touch;
    `;

    const card = document.createElement('div');
    card.style.cssText = `
      background: #fff4e4;
      border-radius: 28px;
      padding: clamp(20px, 5vw, 36px) clamp(16px, 5vw, 30px) clamp(16px, 4vw, 28px);
      max-width: 380px;
      width: min(90vw, 380px);
      text-align: center;
      box-shadow: 0 18px 0 rgba(42, 28, 40, 0.14), 0 32px 64px rgba(20, 16, 40, 0.32);
      font-family: Fredoka, "Trebuchet MS", "Segoe UI", sans-serif;
      transform: translateY(8px) scale(0.96);
      transition: transform 0.28s cubic-bezier(0.2, 0.9, 0.2, 1.15);
      margin-bottom: 24px;
    `;

    // Bird icon — custom SVG sunbird in flight
    const icon = document.createElement('div');
    icon.style.cssText = `
      width: 72px; height: 72px;
      margin: 0 auto 12px;
      border-radius: 22px;
      background: linear-gradient(145deg, #ffc84a, #ff6b3a);
      display: grid; place-items: center;
      box-shadow: 0 6px 0 #c44020, 0 10px 24px rgba(255, 107, 58, 0.35);
    `;
    // Phosphor Icons "bird-fill" — https://phosphoricons.com (MIT License)
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="38" height="38" fill="white"><path d="M236.44,73.34,213.21,57.86A60,60,0,0,0,156,16h-.29C122.79,16.16,96,43.47,96,76.89V96.63L11.63,197.88l-.1.12A16,16,0,0,0,24,224h88A104.11,104.11,0,0,0,216,120V100.28l20.44-13.62a8,8,0,0,0,0-13.32ZM126.15,133.12l-60,72a8,8,0,1,1-12.29-10.24l60-72a8,8,0,1,1,12.29,10.24ZM164,80a12,12,0,1,1,12-12A12,12,0,0,1,164,80Z"/></svg>`;


    const title = document.createElement('h2');
    title.textContent = 'Welcome, Pilot';
    title.style.cssText = `
      margin: 0 0 6px;
      font-size: clamp(22px, 7vw, 32px);
      font-weight: 700;
      background: linear-gradient(180deg, #ff7a45, #e24a3a);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      line-height: 1;
    `;

    const subtitle = document.createElement('p');
    subtitle.textContent = 'What should we call you?';
    subtitle.style.cssText = `
      color: #7a5a62;
      margin: 0 0 22px;
      font-size: 14px;
      line-height: 1.4;
    `;

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = 'Your pilot name';
    this.input.maxLength = 20;
    this.input.autocomplete = 'nickname';
    this.input.style.cssText = `
      width: 100%;
      box-sizing: border-box;
      padding: 13px 16px;
      font-size: 20px;
      font-weight: 700;
      font-family: inherit;
      border: 3px solid #e0c8b8;
      border-radius: 14px;
      background: #fffaf5;
      color: #2a1c28;
      text-align: center;
      margin-bottom: 14px;
      outline: none;
      transition: border-color 0.18s, box-shadow 0.18s;
      box-shadow: inset 0 2px 4px rgba(42,28,40,0.06);
    `;
    this.input.addEventListener('input', () => this.validateName());
    this.input.addEventListener('focus', () => {
      if (this.input) this.input.style.boxShadow = '0 0 0 3px rgba(255, 107, 74, 0.2), inset 0 2px 4px rgba(42,28,40,0.06)';
    });
    this.input.addEventListener('blur', () => {
      if (this.input) this.input.style.boxShadow = 'inset 0 2px 4px rgba(42,28,40,0.06)';
    });

    this.submitButton = document.createElement('button');
    this.submitButton.textContent = '🚀 Start Flying!';
    this.submitButton.disabled = true;
    this.submitButton.style.cssText = `
      width: 100%;
      padding: 14px 24px;
      font-size: 19px;
      font-weight: 700;
      font-family: inherit;
      background: linear-gradient(180deg, #ff8a4a, #ff5a3a);
      color: #fff;
      border: none;
      border-radius: 16px;
      cursor: pointer;
      box-shadow: 0 6px 0 #d44528;
      transition: transform 0.1s, box-shadow 0.1s, opacity 0.15s;
      margin-bottom: 10px;
      opacity: 0.45;
    `;
    this.submitButton.addEventListener('mousedown', () => {
      if (!this.submitButton?.disabled) {
        this.submitButton!.style.transform = 'translateY(3px)';
        this.submitButton!.style.boxShadow = '0 3px 0 #d44528';
      }
    });
    this.submitButton.addEventListener('mouseup', () => {
      if (this.submitButton) {
        this.submitButton.style.transform = '';
        this.submitButton.style.boxShadow = '0 6px 0 #d44528';
      }
    });
    this.submitButton.addEventListener('click', () => this.submit());

    const skipButton = document.createElement('button');
    skipButton.textContent = 'skip for now';
    skipButton.style.cssText = `
      width: 100%;
      padding: 8px;
      font-size: 13px;
      font-family: inherit;
      background: transparent;
      color: #a07860;
      border: none;
      cursor: pointer;
      letter-spacing: 0.03em;
    `;
    skipButton.addEventListener('click', () => this.close());

    card.appendChild(icon);
    card.appendChild(title);
    card.appendChild(subtitle);
    card.appendChild(this.input);
    card.appendChild(this.submitButton);
    card.appendChild(skipButton);
    this.container.appendChild(card);

    document.body.appendChild(this.container);
  }

  private validateName(): void {
    if (!this.input) return;
    const name = this.input.value.trim();
    this.state.name = name;
    const isValid = name.length >= 2 && name.length <= 20 && /^[a-zA-Z0-9_一-鿿]+$/.test(name);
    this.state.isValid = isValid;

    if (this.input) {
      this.input.style.borderColor = isValid ? '#4ade80' : name.length > 0 ? '#ef4444' : '#e0c8b8';
    }
    if (this.submitButton) {
      this.submitButton.disabled = !isValid;
      this.submitButton.style.opacity = isValid ? '1' : '0.45';
      this.submitButton.style.cursor = isValid ? 'pointer' : 'default';
    }
    this.state.error = null;
    if (this.onChange) this.onChange(name);
  }

  private submit(): void {
    if (!this.state.isValid || this.state.isSubmitting) return;
    this.state.isSubmitting = true;
    if (this.onSubmit) this.onSubmit(this.state.name);
    setTimeout(() => this.close(), 500);
  }

  open(): void {
    if (!this.container) return;
    this.state.isOpen = true;
    this.container.style.display = 'flex';
    setTimeout(() => {
      if (this.container) this.container.style.opacity = '1';
      const card = this.container.firstChild as HTMLElement;
      if (card) card.style.transform = 'translateY(0) scale(1)';
      if (this.input) this.input.focus();
    }, 50);
  }

  close(): void {
    if (!this.container) return;
    this.state.isOpen = false;
    this.container.style.opacity = '0';
    const card = this.container.firstChild as HTMLElement;
    if (card) card.style.transform = 'translateY(8px) scale(0.96)';
    setTimeout(() => {
      if (this.container) this.container.style.display = 'none';
    }, 280);
  }

  getState(): NameInputState { return { ...this.state }; }
  hasName(): boolean { return this.state.name.length > 0; }
  getName(): string { return this.state.name; }

  dispose(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }
}

export default NameInput;
