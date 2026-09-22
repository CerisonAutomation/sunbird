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

/** True only in the Poki build (see edition.ts). */
export const POKI_EDITION = false;

export const POKI_MULTIPLAYER = false;

/** Generic portal submissions ship no chat surface (Poki REQ-31 policy). */
export const SQUAD_CHAT = false;

/** No unmoderated player text or personal data (same policy as Poki). */
export const CUSTOM_PILOT_NAMES = false;

/** Portal ad scheduling belongs to the platform; no ad-removal purchase.
 * Unconditionally false: this is the edition's policy, not a build toggle.
 * DCE of the IAP UI comes from vite.config's VITE_SELL_AD_REMOVAL define being
 * folded at the use sites, not from this export. */
export const SELL_AD_REMOVAL = false;
