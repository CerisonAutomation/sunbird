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
