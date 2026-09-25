/**
 * Portal edition strings — the Poki build.
 *
 * Swapped in for `edition.ts` by the portal-alias plugin in vite.config.ts.
 * See edition.ts for the contract (same exports, same signatures).
 */
export const PORTAL_DISPLAY_NAME = "Poki";

export const PORTAL_EDITION_NOTE = "Poki edition · portal rewards enabled";

/**
 * Board-source chip. Poki's own leaderboards are the worldwide ladder on this
 * edition (SDK `init({ submitScore })` + `showLeaderboard`), so the chip says
 * the portal's name and nothing else: "Poki cloud" made players ask which
 * cloud, and a globe emoji next to "Poki" reads as decoration at chip size.
 */
export const LEADERBOARD_CLOUD_LABEL = "Poki";

/** True only in the Poki build (see edition.ts). */
export const POKI_EDITION = true;

/** Poki's netlib transport handles multiplayer; other builds have no room API. */
export const POKI_MULTIPLAYER = true;
export const SIMULATED_BREAKS = false;

/** Poki forbids chat in multiplayer surfaces (REQ-31) — emotes only. */
export const SQUAD_CHAT = false;

/** Player-typed names are allowed on Poki, but every write is gated on
 * isPilotNameClean (profanity filter) before it is stored or broadcast. */
export const CUSTOM_PILOT_NAMES = true;

/** Poki owns ad scheduling and forbids in-app purchases (REQ-20).
 * Unconditionally false: this is the edition's policy, not a build toggle.
 * DCE of the IAP UI comes from vite.config's VITE_SELL_AD_REMOVAL define being
 * folded at the use sites, not from this export. */
export const SELL_AD_REMOVAL = false;

/**
 * Call-sign names that would read as a claim to be the platform or the game
 * itself (the Poki build). Kept HERE, per edition, rather than in the moderation module:
 * that module is shared by every build, so a literal platform name in it ships
 * a foreign portal marker into the other portal bundles — which is a real gate
 * failure, not a hypothetical one.
 */
export const RESERVED_PILOT_NAMES: readonly string[] = ["poki", "sunbird"];
