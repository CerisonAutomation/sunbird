/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
  readonly VITE_STRIPE_GOLD_LINK?: string;
  readonly VITE_STRIPE_VIP_LINK?: string;
  /** `none` for direct/PWA builds, `poki` or `crazy` for a portal export. */
  readonly VITE_PORTAL_TARGET?: "none" | "poki" | "crazy" | "crazygames";
  /** Optional CrazyGames dashboard banner placement id. */
  readonly VITE_CRAZY_BANNER_ID?: string;
  /** Optional HTTPS base URL for the global leaderboard (see LEADERBOARD_API.md). */
  readonly VITE_LEADERBOARD_URL?: string;
  /** Optional WebSocket URL enabling real networked rivals in Mass Race. */
  readonly VITE_MULTIPLAYER_URL?: string;
  /** Optional HTTPS base URL for the social server (friends/clubs/chat). */
  readonly VITE_SOCIAL_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
