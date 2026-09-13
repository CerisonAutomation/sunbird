/**
 * Centralized game exports.
 *
 * WARNING: Barrel files can hurt tree shaking. Use direct imports
 * for performance-critical paths. This barrel is for convenience
 * in non-critical code only.
 */

// Core engine
export { Game } from "./Game";
export { Bird } from "./Bird";
export { TerrainSystem } from "./TerrainSystem";
export { CameraRig } from "./CameraRig";

// Visual effects
export { PostProcessing } from "./PostProcessing";
export { GodRays } from "./GodRays";
export { SpeedLines } from "./SpeedLines";
export { GameJuice } from "./GameJuice";
export { ParticleFX } from "./ParticleFX";

// Audio & Music
export { GameAudio } from "./Audio";
export { Music } from "./Music";

// UI
export { HUD } from "./HUD";
export { LoadingScreen } from "./LoadingScreen";

// Game systems
export { Leaderboard } from "./Leaderboard";
export { GlobalLeaderboard } from "./GlobalLeaderboard";
export { WeeklyTournament } from "./WeeklyTournament";
export { DailyChallenge } from "./DailyChallenge";
export { AdManager } from "./AdManager";
export { Multiplayer } from "./Multiplayer";
export { OnlineMultiplayer } from "./OnlineMultiplayer";

// Data & Config
export { SaveData } from "./SaveData";

// Types
export type { MusicMode, BiomeMusicStyle } from "./Music";
