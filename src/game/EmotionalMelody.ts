/**
 * Emotional Melody System — Breathtaking Musical Evolution
 * 
 * Creates melodies that evolve with gameplay:
 * - Distance increases → melody becomes triumphant
 * - Speed increases → melody becomes energetic
 * - Altitude increases → melody becomes ethereal
 * - Danger decreases → melody becomes tense
 * - Achievement → melody celebrates
 */

export type EmotionalState = {
  distance: number;      // 0-1, how far the player has flown
  speed: number;         // 0-1, current speed relative to max
  altitude: number;      // 0-1, current altitude relative to max
  danger: number;        // 0-1, danger level (0=safe, 1=extreme danger)
  achievement: boolean;  // true when just achieved something
};

export class EmotionalMelody {
  private state: EmotionalState = {
    distance: 0,
    speed: 0.5,
    altitude: 0.3,
    danger: 0,
    achievement: false,
  };

  private emotionalIntensity = 0;
  private lastAchievementTime = 0;

  /** Update emotional state from gameplay */
  updateState(newState: Partial<EmotionalState>): void {
    this.state = { ...this.state, ...newState };
    
    // Calculate emotional intensity based on all factors
    const distanceEmotion = this.state.distance * 0.4;
    const speedEmotion = this.state.speed * 0.3;
    const altitudeEmotion = this.state.altitude * 0.2;
    const dangerEmotion = (1 - this.state.danger) * 0.1; // Less danger = more peaceful
    
    this.emotionalIntensity = distanceEmotion + speedEmotion + altitudeEmotion + dangerEmotion;
    
    // Achievement creates emotional spike
    if (this.state.achievement) {
      this.emotionalIntensity = Math.min(1, this.emotionalIntensity + 0.3);
      this.lastAchievementTime = Date.now();
    }
  }

  /** Get emotional melody variation for current state */
  getMelodyVariation(): {
    pitchOffset: number;     // Semitones to shift melody
    rhythmVariation: number; // 0-1, how much to vary rhythm
    harmonyShift: number;    // 0-2, chord progression index
    dynamics: number;        // 0-1, volume multiplier
    timbre: 'soft' | 'bright' | 'ethereal' | 'triumphant';
  } {
    const t = this.emotionalIntensity;
    
    // Pitch becomes more triumphant with distance
    const pitchOffset = t > 0.7 ? 2 : t > 0.4 ? 1 : 0;
    
    // Rhythm becomes more energetic with speed
    const rhythmVariation = this.state.speed * 0.5;
    
    // Harmony shifts with emotional journey
    const harmonyShift = t > 0.8 ? 2 : t > 0.5 ? 1 : 0;
    
    // Dynamics breathe with emotion
    const dynamics = 0.6 + t * 0.4;
    
    // Timbre changes with emotional state
    let timbre: 'soft' | 'bright' | 'ethereal' | 'triumphant';
    if (t > 0.8) timbre = 'triumphant';
    else if (t > 0.5) timbre = 'bright';
    else if (this.state.altitude > 0.7) timbre = 'ethereal';
    else timbre = 'soft';
    
    return {
      pitchOffset,
      rhythmVariation,
      harmonyShift,
      dynamics,
      timbre,
    };
  }

  /** Get emotional pad parameters */
  getPadParameters(): {
    attackTime: number;    // seconds
    releaseTime: number;   // seconds
    filterCutoff: number;  // Hz
    reverbAmount: number;  // 0-1
    chorusDepth: number;   // 0-1
  } {
    const t = this.emotionalIntensity;
    
    return {
      // More intense = faster attack
      attackTime: 1.2 - t * 0.4,
      // More intense = shorter release
      releaseTime: 0.8 + t * 0.3,
      // More intense = brighter filter
      filterCutoff: 2000 + t * 6000,
      // More intense = less reverb (more direct)
      reverbAmount: 0.9 - t * 0.3,
      // More intense = less chorus (more focused)
      chorusDepth: 0.8 - t * 0.3,
    };
  }

  /** Get emotional bass parameters */
  getBassParameters(): {
    frequency: number;     // Hz
    resonance: number;     // Q factor
    envelope: number;      // 0-1, how much envelope
    distortion: number;    // 0-1, subtle warmth
  } {
    const t = this.emotionalIntensity;
    
    return {
      // More intense = lower, more powerful bass
      frequency: 80 + t * 40,
      // More intense = more resonance
      resonance: 1 + t * 2,
      // More intense = more envelope
      envelope: 0.3 + t * 0.4,
      // More intense = subtle warmth
      distortion: t * 0.15,
    };
  }

  /** Get emotional percussion parameters */
  getPercussionParameters(): {
    intensity: number;     // 0-1
    pattern: 'sparse' | 'groove' | 'driving' | 'intense';
    ghostNotes: boolean;   // subtle background hits
    accent: number;        // 0-1, how much to accent strong beats
  } {
    const t = this.emotionalIntensity;
    const speed = this.state.speed;
    
    let pattern: 'sparse' | 'groove' | 'driving' | 'intense';
    if (t > 0.8 && speed > 0.7) pattern = 'intense';
    else if (t > 0.5) pattern = 'driving';
    else if (t > 0.3) pattern = 'groove';
    else pattern = 'sparse';
    
    return {
      intensity: 0.4 + t * 0.6,
      pattern,
      ghostNotes: t > 0.4,
      accent: 0.5 + t * 0.5,
    };
  }

  /** Check if we should trigger a celebratory moment */
  shouldCelebrate(): boolean {
    const timeSinceAchievement = Date.now() - this.lastAchievementTime;
    return timeSinceAchievement < 3000; // 3 second celebration window
  }

  /** Get current emotional state for UI display */
  getEmotionalLabel(): string {
    const t = this.emotionalIntensity;
    if (t > 0.9) return 'Transcendent';
    if (t > 0.7) return 'Triumphant';
    if (t > 0.5) return 'Exciting';
    if (t > 0.3) return 'Flowing';
    if (t > 0.1) return 'Peaceful';
    return 'Calm';
  }
}

export default EmotionalMelody;
