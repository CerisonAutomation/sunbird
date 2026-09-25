import type { MenuIconName } from "./MenuIcons";
import { SQUAD_CHAT } from "./edition";
/** Canonical home destinations: player-facing names explain what each page is
 * for. Native buttons keep standard Tab/Enter/Space behavior.
 *
 * Wording rule: a destination must name the thing it actually opens. PvP
 * worlds, AI races, and challenge rules now have one home — Challenges — so
 * the root menu stays about choosing a kind of play, not choosing an
 * implementation detail.
 */
export type MenuDestination = { action: string; title: string; detail: string; icon: MenuIconName };
export const PLAY_DESTINATIONS: MenuDestination[] = [
  { action: "open-challenges", icon: "challenge", title: "PvP + PvAI Races", detail: "Random surprise race · human or AI clearly labeled" },
  { action: "play-daily", icon: "daily", title: "Daily challenge", detail: "Long Light · today's shared course" },
  { action: "mode-select", icon: "compass", title: "Solo modes", detail: "Time Trial · Skyline · Coin Rush · Endless" },
  { action: "pvp-duel", icon: "online", title: "Ghost race", detail: "Chase a real player's ghost · seeded rival" },
];
export const COLLECTION_DESTINATIONS: MenuDestination[] = [
  { action: "open-shop", icon: "shop", title: "Shop", detail: "Birds, trails & upgrades" },
  { action: "open-squad", icon: "squad", title: "Squad", detail: SQUAD_CHAT ? "Friends & club chat" : "Friends & clubs" },
  { action: "open-settings", icon: "settings", title: "Settings", detail: "Sound, controls & display" },
];
export const PROGRESS_DESTINATIONS: MenuDestination[] = [
  { action: "open-progress", icon: "progress", title: "Your progress", detail: "Missions · trophies · scores · season pass" },
  { action: "open-cups", icon: "trophy", title: "Tournaments", detail: "Weekly score challenges" },
  { action: "open-campaign", icon: "story", title: "Story", detail: "The Long Migration · island atlas" },
  { action: "open-rank", icon: "rank", title: "Rival rank", detail: "Your local race rating" },
  { action: "open-board", icon: "board", title: "Leaderboards", detail: "All-time · weekly · today · you" },
  { action: "open-account", icon: "account", title: "Account", detail: "Name · save transfer · settings" },
];
