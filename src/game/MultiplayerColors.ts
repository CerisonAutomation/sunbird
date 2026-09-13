/**
 * Multiplayer Color Selection System
 * 
 * Allows players to choose their bird color in multiplayer:
 * - Pre-defined color palettes
 * - Color preview
 * - Persistence across sessions
 * - Visual differentiation in races
 */

export type BirdColor = {
  id: string;
  name: string;
  body: number;
  wing: number;
  belly: number;
  beak: number;
  preview: string; // CSS color for UI
};

// Pre-defined bird color palettes
export const BIRD_COLORS: BirdColor[] = [
  // Classic colors
  {
    id: 'sunset',
    name: 'Sunset',
    body: 0xff7a45,
    wing: 0xff9a62,
    belly: 0xffe6c4,
    beak: 0xffc447,
    preview: '#ff7a45',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    body: 0x4a9eff,
    wing: 0x6ab4ff,
    belly: 0xc4e0ff,
    beak: 0xffc447,
    preview: '#4a9eff',
  },
  {
    id: 'forest',
    name: 'Forest',
    body: 0x4ade80,
    wing: 0x6ee7a0,
    belly: 0xbbf7d0,
    beak: 0xfbbf24,
    preview: '#4ade80',
  },
  {
    id: 'royal',
    name: 'Royal',
    body: 0x9370db,
    wing: 0xb19cd9,
    belly: 0xe6e6fa,
    beak: 0xffd700,
    preview: '#9370db',
  },
  {
    id: 'crimson',
    name: 'Crimson',
    body: 0xdc143c,
    wing: 0xf08080,
    belly: 0xffc0cb,
    beak: 0xffd700,
    preview: '#dc143c',
  },
  {
    id: 'golden',
    name: 'Golden',
    body: 0xffd700,
    wing: 0xffec8b,
    belly: 0xfffff0,
    beak: 0xff8c00,
    preview: '#ffd700',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    body: 0x191970,
    wing: 0x4169e1,
    belly: 0xb0c4de,
    beak: 0xffd700,
    preview: '#191970',
  },
  {
    id: 'cherry',
    name: 'Cherry',
    body: 0xff69b4,
    wing: 0xffb6c1,
    belly: 0xfff0f5,
    beak: 0xffd700,
    preview: '#ff69b4',
  },
  
  // Special colors (unlockable)
  {
    id: 'neon-green',
    name: 'Neon Green',
    body: 0x39ff14,
    wing: 0x7cfc00,
    belly: 0x98fb98,
    beak: 0xffd700,
    preview: '#39ff14',
  },
  {
    id: 'neon-pink',
    name: 'Neon Pink',
    body: 0xff1493,
    wing: 0xff69b4,
    belly: 0xffb6c1,
    beak: 0xffd700,
    preview: '#ff1493',
  },
  {
    id: 'neon-blue',
    name: 'Neon Blue',
    body: 0x00bfff,
    wing: 0x87cefa,
    belly: 0xb0e0e6,
    beak: 0xffd700,
    preview: '#00bfff',
  },
  {
    id: 'rainbow',
    name: 'Rainbow',
    body: 0xff0000,
    wing: 0x00ff00,
    belly: 0x0000ff,
    beak: 0xffff00,
    preview: 'linear-gradient(90deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #8b00ff)',
  },
];

export class MultiplayerColors {
  private selectedColor: BirdColor;
  private unlockedColors: string[];
  private container: HTMLDivElement | null = null;

  constructor() {
    // Default to sunset color
    this.selectedColor = BIRD_COLORS[0]!;
    
    // Load unlocked colors from localStorage
    const saved = localStorage.getItem('sunbird-unlocked-colors');
    this.unlockedColors = saved ? JSON.parse(saved) : ['sunset', 'ocean', 'forest', 'royal', 'crimson', 'golden', 'midnight', 'cherry'];
    
    // Load selected color
    const savedColor = localStorage.getItem('sunbird-selected-color');
    if (savedColor) {
      const found = BIRD_COLORS.find(c => c.id === savedColor);
      if (found && this.isUnlocked(found.id)) {
        this.selectedColor = found;
      }
    }
  }

  /** Get all available colors */
  getAllColors(): BirdColor[] {
    return BIRD_COLORS;
  }

  /** Get unlocked colors */
  getUnlockedColors(): BirdColor[] {
    return BIRD_COLORS.filter(c => this.isUnlocked(c.id));
  }

  /** Check if color is unlocked */
  isUnlocked(colorId: string): boolean {
    return this.unlockedColors.includes(colorId);
  }

  /** Unlock a color */
  unlockColor(colorId: string): boolean {
    if (this.isUnlocked(colorId)) return false;
    this.unlockedColors.push(colorId);
    localStorage.setItem('sunbird-unlocked-colors', JSON.stringify(this.unlockedColors));
    return true;
  }

  /** Select a color */
  selectColor(colorId: string): boolean {
    const color = BIRD_COLORS.find(c => c.id === colorId);
    if (!color || !this.isUnlocked(colorId)) return false;
    
    this.selectedColor = color;
    localStorage.setItem('sunbird-selected-color', colorId);
    return true;
  }

  /** Get currently selected color */
  getSelectedColor(): BirdColor {
    return this.selectedColor;
  }

  /** Get color by ID */
  getColorById(id: string): BirdColor | undefined {
    return BIRD_COLORS.find(c => c.id === id);
  }

  /** Create color selection UI */
  createUI(onSelect: (color: BirdColor) => void): HTMLDivElement {
    this.container = document.createElement('div');
    this.container.className = 'color-selection';
    this.container.style.cssText = `
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      padding: 16px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 12px;
    `;

    for (const color of BIRD_COLORS) {
      const btn = document.createElement('button');
      btn.className = 'color-btn';
      btn.style.cssText = `
        width: 48px;
        height: 48px;
        border-radius: 50%;
        border: 3px solid ${this.selectedColor.id === color.id ? '#ffd700' : 'transparent'};
        background: ${color.preview};
        cursor: pointer;
        transition: transform 0.2s, border-color 0.2s;
        opacity: ${this.isUnlocked(color.id) ? '1' : '0.4'};
        pointer-events: ${this.isUnlocked(color.id) ? 'auto' : 'none'};
      `;
      btn.title = color.name;
      btn.addEventListener('click', () => {
        if (this.selectColor(color.id)) {
          onSelect(color);
          this.updateUI();
        }
      });
      btn.addEventListener('mouseenter', () => {
        btn.style.transform = 'scale(1.1)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = 'scale(1)';
      });
      this.container.appendChild(btn);
    }

    return this.container;
  }

  /** Update UI to reflect current selection */
  private updateUI(): void {
    if (!this.container) return;
    
    const buttons = this.container.querySelectorAll('.color-btn');
    buttons.forEach((btn, i) => {
      const color = BIRD_COLORS[i];
      if (color) {
        (btn as HTMLElement).style.border = `3px solid ${this.selectedColor.id === color.id ? '#ffd700' : 'transparent'}`;
      }
    });
  }

  /** Get bird skin from color */
  getBirdSkin(color: BirdColor): { body: number; wing: number; belly: number; beak: number } {
    return {
      body: color.body,
      wing: color.wing,
      belly: color.belly,
      beak: color.beak,
    };
  }

  /** Dispose */
  dispose(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }
}

export default MultiplayerColors;
