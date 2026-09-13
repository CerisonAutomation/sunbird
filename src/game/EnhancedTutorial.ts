/**
 * Enhanced Tutorial System
 * 
 * Provides comprehensive hints for new players:
 * - Progressive learning (basic → intermediate → advanced)
 * - Context-aware hints (based on gameplay situation)
 * - Name input for personalization
 * - Visual demonstrations
 * - Achievement tracking
 */

export type TutorialHint = {
  id: string;
  text: string;
  condition: 'always' | 'first_run' | 'speed_low' | 'altitude_low' | 'coins_low' | 'fever_available' | 'multiplayer_available';
  priority: number; // Higher = shown first
  duration: number; // seconds to show
  visual?: 'arrow' | 'highlight' | 'pulse' | 'glow';
  action?: string;
};

export type TutorialProgress = {
  name: string;
  hintsShown: string[];
  completedSteps: string[];
  tutorialComplete: boolean;
  lastHintTime: number;
};

// Progressive tutorial hints
export const TUTORIAL_HINTS: TutorialHint[] = [
  // Basic Controls
  {
    id: 'hold_to_dive',
    text: '👆 HOLD anywhere to dive down',
    condition: 'first_run',
    priority: 100,
    duration: 5,
    visual: 'pulse',
  },
  {
    id: 'release_to_glide',
    text: '✈️ RELEASE to glide upward',
    condition: 'first_run',
    priority: 99,
    duration: 5,
    visual: 'pulse',
  },
  {
    id: 'momentum_matters',
    text: '💨 Speed is momentum — keep it up!',
    condition: 'first_run',
    priority: 95,
    duration: 4,
    visual: 'highlight',
  },
  
  // Terrain
  {
    id: 'follow_hills',
    text: '⛰️ Follow the hills for speed',
    condition: 'speed_low',
    priority: 80,
    duration: 4,
    visual: 'arrow',
  },
  {
    id: 'avoid_water',
    text: '🌊 Avoid the water — it slows you down!',
    condition: 'always',
    priority: 75,
    duration: 3,
    visual: 'highlight',
  },
  
  // Collectibles
  {
    id: 'collect_coins',
    text: '🪙 Collect coins to unlock skins!',
    condition: 'coins_low',
    priority: 70,
    duration: 4,
    visual: 'glow',
  },
  {
    id: 'cloud_bonus',
    text: '☁️ Touch clouds for bonus points!',
    condition: 'always',
    priority: 65,
    duration: 3,
    visual: 'pulse',
  },
  
  // Advanced
  {
    id: 'perfect_landing',
    text: '✨ Land perfectly for speed boost!',
    condition: 'first_run',
    priority: 60,
    duration: 4,
    visual: 'highlight',
  },
  {
    id: 'launch_boost',
    text: '🚀 Release at the right time for launch boost!',
    condition: 'first_run',
    priority: 55,
    duration: 4,
    visual: 'arrow',
  },
  
  // Fever Mode
  {
    id: 'fever_mode',
    text: '🔥 Collect 3 suns to enter FEVER MODE!',
    condition: 'fever_available',
    priority: 85,
    duration: 5,
    visual: 'glow',
  },
  
  // Multiplayer
  {
    id: 'multiplayer_intro',
    text: '🌐 Try Multiplayer — race against friends!',
    condition: 'multiplayer_available',
    priority: 50,
    duration: 5,
    visual: 'pulse',
  },
  
  // Social
  {
    id: 'share_score',
    text: '📤 Share your best score with friends!',
    condition: 'always',
    priority: 40,
    duration: 3,
  },
  {
    id: 'daily_challenge',
    text: '📅 Try the Daily Challenge for rewards!',
    condition: 'always',
    priority: 45,
    duration: 4,
  },
  
  // Shop
  {
    id: 'check_shop',
    text: '🛍️ Visit the Shop for new skins!',
    condition: 'coins_low',
    priority: 35,
    duration: 3,
  },
];

export class EnhancedTutorial {
  private progress: TutorialProgress;
  private hints: TutorialHint[];
  private shownHints: Set<string>;
  private currentHint: TutorialHint | null = null;
  // private _hintTimer = 0; // Reserved for future use

  constructor(savedName?: string) {
    this.progress = {
      name: savedName || '',
      hintsShown: [],
      completedSteps: [],
      tutorialComplete: false,
      lastHintTime: 0,
    };
    this.hints = [...TUTORIAL_HINTS].sort((a, b) => b.priority - a.priority);
    this.shownHints = new Set(this.progress.hintsShown);
  }

  /** Set player name */
  setName(name: string): void {
    this.progress.name = name;
  }

  /** Get player name */
  getName(): string {
    return this.progress.name;
  }

  /** Check if name is set */
  hasName(): boolean {
    return this.progress.name.length > 0;
  }

  /** Get next hint based on current game state */
  getNextHint(gameState: {
    runsPlayed: number;
    speed: number;
    altitude: number;
    coins: number;
    hasFever: boolean;
    multiplayerAvailable: boolean;
  }): TutorialHint | null {
    // Don't show hints after first 5 runs
    if (gameState.runsPlayed > 5) {
      return null;
    }

    // Don't show hints too frequently
    const now = Date.now();
    if (now - this.progress.lastHintTime < 10000) { // 10 second cooldown
      return null;
    }

    for (const hint of this.hints) {
      // Skip already shown hints
      if (this.shownHints.has(hint.id)) continue;

      // Check condition
      if (this.checkCondition(hint.condition, gameState)) {
        this.currentHint = hint;
        return hint;
      }
    }

    return null;
  }

  /** Check if hint condition is met */
  private checkCondition(condition: TutorialHint['condition'], gameState: {
    runsPlayed: number;
    speed: number;
    altitude: number;
    coins: number;
    hasFever: boolean;
    multiplayerAvailable: boolean;
  }): boolean {
    switch (condition) {
      case 'always':
        return true;
      case 'first_run':
        return gameState.runsPlayed <= 1;
      case 'speed_low':
        return gameState.speed < 20;
      case 'altitude_low':
        return gameState.altitude < 30;
      case 'coins_low':
        return gameState.coins < 50;
      case 'fever_available':
        return gameState.hasFever;
      case 'multiplayer_available':
        return gameState.multiplayerAvailable;
      default:
        return false;
    }
  }

  /** Mark hint as shown */
  markHintShown(hintId: string): void {
    this.shownHints.add(hintId);
    this.progress.hintsShown.push(hintId);
    this.progress.lastHintTime = Date.now();
  }

  /** Complete a tutorial step */
  completeStep(stepId: string): void {
    if (!this.progress.completedSteps.includes(stepId)) {
      this.progress.completedSteps.push(stepId);
    }
  }

  /** Check if tutorial is complete */
  isTutorialComplete(): boolean {
    return this.progress.tutorialComplete;
  }

  /** Mark tutorial as complete */
  markTutorialComplete(): void {
    this.progress.tutorialComplete = true;
  }

  /** Get progress percentage */
  getProgressPercentage(): number {
    const totalHints = TUTORIAL_HINTS.length;
    const shown = this.shownHints.size;
    return Math.round((shown / totalHints) * 100);
  }

  /** Get current hint */
  getCurrentHint(): TutorialHint | null {
    return this.currentHint;
  }

  /** Clear current hint */
  clearCurrentHint(): void {
    this.currentHint = null;
  }

  /** Get personalized greeting */
  getGreeting(): string {
    if (!this.hasName()) {
      return 'Welcome to Sunbird!';
    }
    return `Welcome back, ${this.progress.name}!`;
  }

  /** Get tutorial summary */
  getTutorialSummary(): {
    hintsShown: number;
    stepsCompleted: number;
    progress: number;
    isComplete: boolean;
  } {
    return {
      hintsShown: this.shownHints.size,
      stepsCompleted: this.progress.completedSteps.length,
      progress: this.getProgressPercentage(),
      isComplete: this.progress.tutorialComplete,
    };
  }
}

export default EnhancedTutorial;
