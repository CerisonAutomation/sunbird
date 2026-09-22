/**
 * Portal edition strings — the portable "generic" build (GameDistribution,
 * Yandex, Newgrounds, GameMonetize, …).
 *
 * Swapped in for `edition.ts` by the portal-alias plugin in vite.config.ts.
 * See edition.ts for the contract (same exports, same signatures).
 *
 * It keeps the neutral branding (it is not tied to one portal) but follows the
 * portal surface rules: no chat, no external social surfaces.
 */
export const PORTAL_DISPLAY_NAME = "Portal";

export const PORTAL_EDITION_NOTE = "Portal edition";

export const LEADERBOARD_CLOUD_LABEL = "☁️ cloud";

export const POKI_MULTIPLAYER = false;

/** Generic portal submissions ship no chat surface (Poki REQ-31 policy). */
export const SQUAD_CHAT = false;

/** No unmoderated player text or personal data (same policy as Poki). */
export const CUSTOM_PILOT_NAMES = false;

/** Portal ad scheduling belongs to the platform; no ad-removal purchase.
 * Read from Vite define so Rollup/Terser can DCE IAP UI from this bundle. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SELL_AD_REMOVAL: boolean = !!(import.meta.env.VITE_SELL_AD_REMOVAL as any);
