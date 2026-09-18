/**
 * Portal edition strings — the CrazyGames build.
 *
 * Swapped in for `edition.ts` by the portal-alias plugin in vite.config.ts.
 * See edition.ts for the contract (same exports, same signatures).
 */
export const PORTAL_DISPLAY_NAME = "CrazyGames";

export const PORTAL_EDITION_NOTE = "CrazyGames edition · portal rewards enabled";

export const LEADERBOARD_CLOUD_LABEL = "☁️ cloud";

/** CrazyGames multiplayer is its own instant-multiplayer module, not netlib. */
export const POKI_MULTIPLAYER = false;

/** Portal submissions ship no chat surface (Poki REQ-31, same policy everywhere). */
export const SQUAD_CHAT = false;
