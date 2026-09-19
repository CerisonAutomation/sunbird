/**
 * Portal edition strings — the Poki build.
 *
 * Swapped in for `edition.ts` by the portal-alias plugin in vite.config.ts.
 * See edition.ts for the contract (same exports, same signatures).
 */
export const PORTAL_DISPLAY_NAME = "Poki";

export const PORTAL_EDITION_NOTE = "Poki edition · portal rewards enabled";

export const LEADERBOARD_CLOUD_LABEL = "☁️ Poki cloud";

/** Poki's netlib transport handles multiplayer; other builds have no room API. */
export const POKI_MULTIPLAYER = true;

/** Poki forbids chat in multiplayer surfaces (REQ-31) — emotes only. */
export const SQUAD_CHAT = false;

/** No unmoderated player text or personal data (content & player safety). */
export const CUSTOM_PILOT_NAMES = false;

/** Poki owns ad scheduling and forbids in-app purchases (REQ-20). */
export const SELL_AD_REMOVAL = false;
