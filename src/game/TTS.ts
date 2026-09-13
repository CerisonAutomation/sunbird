/**
 * Cartoony TTS using Web Speech API with the best available system voice.
 * 
 * Voice selection priority:
 *   macOS/iOS: Samantha (natural female) → Daniel (natural male) →任何 English
 *   Chrome: Google US English → any English
 *   Firefox/other: first English voice
 * 
 * Pitch/rate modulation creates the cartoony game feel.
 * Falls back gracefully when not supported.
 */

type Emotion = "excited" | "calm" | "dramatic" | "playful" | "urgent";

type Phrase = {
  text: string;
  pitch: number;   // 0.5 - 2.0
  rate: number;    // 0.5 - 2.0
  volume: number;  // 0.0 - 1.0
};

const PHRASES: Record<string, Phrase[]> = {
  perfect: [
    { text: "Perfect!", pitch: 1.3, rate: 1.1, volume: 0.9 },
    { text: "Nailed it!", pitch: 1.25, rate: 1.05, volume: 0.85 },
    { text: "Butter smooth!", pitch: 1.2, rate: 1.0, volume: 0.8 },
  ],
  great: [
    { text: "Great!", pitch: 1.15, rate: 1.1, volume: 0.75 },
    { text: "Nice one!", pitch: 1.1, rate: 1.0, volume: 0.7 },
  ],
  fever: [
    { text: "Fever mode!", pitch: 1.4, rate: 1.2, volume: 0.95 },
    { text: "You're on fire!", pitch: 1.35, rate: 1.15, volume: 0.9 },
  ],
  zenith: [
    { text: "Zenith!", pitch: 1.5, rate: 0.9, volume: 0.9 },
    { text: "To the stars!", pitch: 1.4, rate: 1.0, volume: 0.85 },
  ],
  island: [
    { text: "Island!", pitch: 1.15, rate: 1.1, volume: 0.7 },
    { text: "New shore!", pitch: 1.1, rate: 1.0, volume: 0.65 },
  ],
  gameover: [
    { text: "Oh no!", pitch: 0.85, rate: 0.9, volume: 0.7 },
    { text: "Sunbird sleeps.", pitch: 0.8, rate: 0.85, volume: 0.6 },
  ],
  newbest: [
    { text: "New best!", pitch: 1.5, rate: 1.1, volume: 0.95 },
    { text: "Personal record!", pitch: 1.4, rate: 1.0, volume: 0.9 },
  ],
  combo3: [
    { text: "Triple combo!", pitch: 1.25, rate: 1.1, volume: 0.8 },
  ],
  combo5: [
    { text: "Five combo!", pitch: 1.3, rate: 1.15, volume: 0.85 },
  ],
  combo10: [
    { text: "Ten combo!", pitch: 1.35, rate: 1.2, volume: 0.9 },
  ],
  powerup: [
    { text: "Power up!", pitch: 1.25, rate: 1.1, volume: 0.7 },
  ],
  launch: [
    { text: "Wheee!", pitch: 1.4, rate: 1.3, volume: 0.7 },
  ],
  splash: [
    { text: "Splash!", pitch: 0.95, rate: 1.2, volume: 0.6 },
  ],
  storm: [
    { text: "Storm!", pitch: 1.1, rate: 1.0, volume: 0.7 },
  ],
  thermal: [
    { text: "Thermal!", pitch: 1.15, rate: 0.9, volume: 0.65 },
  ],
};

const EMOTION_MOD: Record<Emotion, { pitchMod: number; rateMod: number }> = {
  excited:  { pitchMod: 0.1, rateMod: 0.05 },
  calm:     { pitchMod: -0.05, rateMod: -0.05 },
  dramatic: { pitchMod: -0.1, rateMod: -0.15 },
  playful:  { pitchMod: 0.05, rateMod: 0.02 },
  urgent:   { pitchMod: 0.15, rateMod: 0.1 },
};

export class TTS {
  private synth: SpeechSynthesis | null = null;
  private enabled = false;
  private voice: SpeechSynthesisVoice | null = null;
  private queue: Phrase[] = [];
  private speaking = false;
  private lastCategory = "";
  private lastSpokenTime = 0;
  private readonly DEDUP_MS = 600;

  init(): void {
    if (!("speechSynthesis" in window)) return;
    this.synth = window.speechSynthesis;
    this.enabled = true;

    const pickBestVoice = () => {
      const voices = this.synth!.getVoices();
      if (!voices.length) return;

      // Priority: neural/natural > Google > Apple > any English
      // Exclude known robotic/eSpeak voices (prefix "en_" or name contains "eSpeak")
      const isGood = (v: SpeechSynthesisVoice) =>
        v.lang.startsWith("en") && !v.name.includes("eSpeak") && !v.lang.startsWith("en_");
      const preferred: ((v: SpeechSynthesisVoice) => boolean)[] = [
        // Microsoft Neural (Edge/Windows) — highest quality free TTS available
        (v) => isGood(v) && v.name.includes("Microsoft") && v.name.includes("Neural"),
        (v) => isGood(v) && v.name.includes("Microsoft Aria"),
        (v) => isGood(v) && v.name.includes("Microsoft Jenny"),
        (v) => isGood(v) && v.name.includes("Microsoft") && v.name.includes("Online"),
        // macOS/iOS natural voices
        (v) => isGood(v) && v.name === "Samantha",
        (v) => isGood(v) && v.name === "Karen",
        (v) => isGood(v) && v.name === "Moira",
        (v) => isGood(v) && v.name === "Daniel",
        // Chrome Google voices
        (v) => isGood(v) && v.name.includes("Google US English"),
        (v) => isGood(v) && v.name.includes("Google UK English Female"),
        (v) => isGood(v) && v.name.includes("Google"),
        // Any non-robotic English
        (v) => isGood(v) && v.localService === false, // online = higher quality
        (v) => isGood(v),
        // Last resort
        (v) => v.lang.startsWith("en"),
      ];

      for (const pred of preferred) {
        const match = voices.find(pred);
        if (match) { this.voice = match; return; }
      }
      this.voice = voices[0] ?? null;
    };

    pickBestVoice();
    this.synth.onvoiceschanged = pickBestVoice;
  }

  speak(category: string, emotion: Emotion = "excited", priority = false): void {
    if (!this.enabled || !this.synth) return;

    const now = performance.now();
    if (category === this.lastCategory && now - this.lastSpokenTime < this.DEDUP_MS) return;
    this.lastCategory = category;
    this.lastSpokenTime = now;

    const phrases = PHRASES[category];
    if (!phrases?.length) return;
    const base = phrases[Math.floor(Math.random() * phrases.length)]!;
    const mod = EMOTION_MOD[emotion];

    const phrase: Phrase = {
      text: base.text,
      pitch: clamp(base.pitch + mod.pitchMod, 0.5, 2.0),
      rate: clamp(base.rate + mod.rateMod, 0.5, 2.0),
      volume: base.volume,
    };

    if (priority) {
      this.synth.cancel();
      this.speaking = false;
      this.queue = [];
    }

    this.queue.push(phrase);
    this.processQueue();
  }

  announcePerfect(): void { this.speak("perfect", "excited", true); }
  announceGreat(): void { this.speak("great", "playful"); }
  announceFever(): void { this.speak("fever", "excited", true); }
  announceZenith(): void { this.speak("zenith", "dramatic", true); }
  announceIsland(_name: string): void { this.speak("island", "calm"); }
  announceGameOver(): void { this.speak("gameover", "dramatic"); }
  announceNewBest(): void { this.speak("newbest", "excited", true); }
  announceCombo(n: number): void {
    if (n >= 10) this.speak("combo10", "excited", true);
    else if (n >= 5) this.speak("combo5", "excited");
    else if (n >= 3) this.speak("combo3", "playful");
  }
  announcePowerup(): void { this.speak("powerup", "excited"); }
  announceLaunch(): void { this.speak("launch", "excited"); }
  announceSplash(): void { this.speak("splash", "calm"); }
  announceStorm(): void { this.speak("storm", "urgent"); }
  announceThermal(): void { this.speak("thermal", "playful"); }

  setEnabled(on: boolean): void {
    this.enabled = on && !!this.synth;
    if (!this.enabled) this.synth?.cancel();
  }
  isEnabled(): boolean { return this.enabled; }
  getVoiceName(): string { return this.voice?.name ?? "none"; }

  dispose(): void {
    this.synth?.cancel();
    this.queue = [];
    this.speaking = false;
  }

  private processQueue(): void {
    if (this.speaking || !this.queue.length || !this.synth) return;
    const phrase = this.queue.shift()!;
    const u = new SpeechSynthesisUtterance(phrase.text);
    if (this.voice) u.voice = this.voice;
    u.rate = phrase.rate;
    u.pitch = phrase.pitch;
    u.volume = phrase.volume;
    u.onend = () => { this.speaking = false; this.processQueue(); };
    u.onerror = () => { this.speaking = false; this.processQueue(); };
    this.synth.speak(u);
    this.speaking = true;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
