/**
 * Portal edition strings — the WEB/generic/itch flavour.
 *
 * `vite.config.ts` swaps this module for `edition.poki.ts` / `edition.crazy.ts`
 * at build time (same plugin that shims the portal adapters), so every bundle
 * contains exactly ONE edition's strings. That is deliberate: a shared ternary
 * on the runtime portal name embeds all three names in every build, and portal
 * scanners flag a competitor's name in a bundle even when the branch is dead.
 *
 * Keep this file and its siblings in lockstep — same exports, same signatures.
 */
export const PORTAL_DISPLAY_NAME = "Portal";

/** Shown on the menu when the build has portal rewards (hidden when "none"). */
export const PORTAL_EDITION_NOTE = "Portal edition";

/** Label for the leaderboard-backend chip. */
export const LEADERBOARD_CLOUD_LABEL = "☁️ cloud";

/** True only in the Poki build (Poki's netlib multiplayer transport). */
export const POKI_MULTIPLAYER = false;

/**
 * Club chat. OFF in every portal edition: the platforms forbid chat in
 * multiplayer surfaces (Poki rule REQ-31 — emotes/quick-messages are the
 * sanctioned alternative), so the chat box is not merely disabled at runtime
 * there, it is not in the bundle at all. The direct/web/itch build owns its
 * own surfaces and keeps it.
 */
export const SQUAD_CHAT = true;

/**
 * Free-text pilot names. OFF in every portal edition: the name is broadcast to
 * real players (netlib rooms, race rosters, floating name tags), and Poki's
 * content & player-safety policy allows no unmoderated player-authored text and
 * no collection of personal data. Portal pilots pick a curated generated name
 * with 🎲 Random instead, so the text field is not in those bundles at all.
 * The direct/web/itch build owns its own surfaces and keeps free rename.
 */
export const CUSTOM_PILOT_NAMES = true;

/**
 * Selling ad removal. OFF in every portal edition: the platform owns ad
 * scheduling and forbids in-app purchases, including any "remove ads" offer
 * (Poki rule REQ-20). Portal builds never inject interstitials of their own, so
 * on a portal the claim would be non-compliant *and* untrue.
 */
export const SELL_AD_REMOVAL = true;
