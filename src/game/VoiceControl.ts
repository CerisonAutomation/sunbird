/**
 * Voice control using Web Speech Recognition API.
 * 
 * Commands (with fuzzy matching):
 *   "dive"  — hold to dive: "dive", "down", "hold", "press", "sink", "drop"
 *   "glide" — release to glide: "glide", "up", "release", "fly", "soar", "rise"
 *   "pause" — pause game: "pause", "stop", "wait", "hold on"
 *   "resume" — resume game: "resume", "continue", "go", "play", "start"
 *   "menu"  — go to menu: "menu", "home", "back", "quit", "exit"
 *   "boost" — activate boost: "boost", "speed", "fast", "rocket"
 *   "shield" — activate shield: "shield", "protect", "guard", "block"
 * 
 * Falls back gracefully when not supported.
 */

export type VoiceCommand = "dive" | "glide" | "pause" | "resume" | "menu" | "boost" | "shield" | "none";

// Fuzzy keyword groups for each command
const COMMAND_KEYWORDS: Record<VoiceCommand, string[]> = {
  dive:   ["dive", "down", "hold", "press", "sink", "drop", "duck", "lower"],
  glide:  ["glide", "up", "release", "fly", "soar", "rise", "lift", "float", "let go"],
  pause:  ["pause", "stop", "wait", "hold on", "freeze", "chill"],
  resume: ["resume", "continue", "go", "play", "start", "unpause", "ready"],
  menu:   ["menu", "home", "back", "quit", "exit", "leave"],
  boost:  ["boost", "speed", "fast", "rocket", "turbo", "zoom"],
  shield: ["shield", "protect", "guard", "block", "armor"],
  none:   [],
};

type SR = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: { isFinal: boolean; [i: number]: { transcript: string; confidence: number } }[] }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

export class VoiceControl {
  private recognition: SR | null = null;
  private enabled = false;
  private listening = false;
  private onCommand: ((cmd: VoiceCommand) => void) | null = null;
  private lastCommand: VoiceCommand = "none";
  private confidence = 0;
  private commandCount = 0;
  private lastCommandTime = 0;
  private readonly DEDUP_MS = 300; // Don't repeat same command within 300ms

  init(): void {
    const SRClass = (window as unknown as Record<string, unknown>)["SpeechRecognition"] ??
                    (window as unknown as Record<string, unknown>)["webkitSpeechRecognition"];
    if (!SRClass) return;
    this.recognition = new (SRClass as new () => SR)();
    this.recognition.continuous = true;
    this.recognition.interimResults = false;
    this.recognition.lang = "en-US";
    this.recognition.onresult = (e) => {
      const last = e.results[e.results.length - 1];
      if (!last.isFinal) return;
      const transcript = last[0].transcript.toLowerCase().trim();
      this.confidence = last[0].confidence;
      const cmd = this.parseCommand(transcript);
      if (cmd !== "none") {
        // Dedup — don't fire same command too quickly
        const now = performance.now();
        if (cmd === this.lastCommand && now - this.lastCommandTime < this.DEDUP_MS) return;
        this.lastCommand = cmd;
        this.lastCommandTime = now;
        this.commandCount++;
        this.onCommand?.(cmd);
      }
    };
    this.recognition.onerror = () => {};
    this.recognition.onend = () => { if (this.listening) this.start(); };
    this.enabled = true;
  }

  start(): void {
    if (!this.recognition || !this.enabled || this.listening) return;
    try { this.recognition.start(); this.listening = true; } catch { /* already started */ }
  }

  stop(): void {
    if (!this.recognition) return;
    try { this.recognition.stop(); } catch { /* ignore */ }
    this.listening = false;
  }

  onVoiceCommand(cb: (cmd: VoiceCommand) => void): void { this.onCommand = cb; }
  getLastCommand(): VoiceCommand { return this.lastCommand; }
  getConfidence(): number { return this.confidence; }
  getCommandCount(): number { return this.commandCount; }
  isSupported(): boolean { return !!this.recognition; }
  isEnabled(): boolean { return this.enabled; }
  isListening(): boolean { return this.listening; }
  setEnabled(on: boolean): void { this.enabled = on; if (!on) this.stop(); }

  private parseCommand(text: string): VoiceCommand {
    // Check each command's keywords — longest match first for accuracy
    let bestMatch: VoiceCommand = "none";
    let bestLen = 0;
    for (const [cmd, keywords] of Object.entries(COMMAND_KEYWORDS) as [VoiceCommand, string[]][]) {
      if (cmd === "none") continue;
      for (const kw of keywords) {
        if (text.includes(kw) && kw.length > bestLen) {
          bestMatch = cmd;
          bestLen = kw.length;
        }
      }
    }
    return bestMatch;
  }

  dispose(): void { this.stop(); this.recognition = null; }
}
