import type { MenuIconName } from "./MenuIcons";
/** Canonical home destinations: player-facing names explain what each page is
 * for. Native buttons keep standard Tab/Enter/Space behavior. */
export type MenuDestination = { action: string; title: string; detail: string; icon: MenuIconName };
export const PLAY_DESTINATIONS: MenuDestination[] = [
  { action: "open-live", icon: "online", title: "Play online", detail: "Create or join a room" },
  { action: "versus", icon: "versus", title: "Same-screen 1v1", detail: "Space / Enter · or touch your half" },
  { action: "mode-select", icon: "compass", title: "Solo modes", detail: "Time Trial · Skyline · Coin Rush" },
  { action: "start-endless", icon: "endless", title: "Endless", detail: "No clock · growing challenge" },
];
export const COLLECTION_DESTINATIONS: MenuDestination[] = [
  { action: "open-shop", icon: "shop", title: "Shop", detail: "Birds, trails & upgrades" },
  { action: "open-squad", icon: "squad", title: "Squad", detail: "Friends & club chat" },
  { action: "open-settings", icon: "settings", title: "Settings", detail: "Sound, controls & display" },
];
export const PROGRESS_DESTINATIONS: MenuDestination[] = [
  { action: "open-challenges", icon: "challenge", title: "Challenges", detail: "Daily & weekly goals" },
  { action: "open-progress", icon: "progress", title: "Your progress", detail: "Missions, gifts & events" },
  { action: "open-cups", icon: "trophy", title: "Tournaments", detail: "Weekly score challenges" },
  { action: "open-campaign", icon: "story", title: "Story", detail: "The Long Migration" },
  { action: "open-rank", icon: "rank", title: "Rival rank", detail: "Your local race rating" },
  { action: "open-pass", icon: "pass", title: "Nest Pass", detail: "Season rewards" },
  { action: "open-trophies", icon: "medal", title: "Trophies", detail: "Achievements & mastery" },
  { action: "open-atlas", icon: "atlas", title: "Island Atlas", detail: "Islands & hazards" },
  { action: "open-scores", icon: "scores", title: "Your scores", detail: "Saved flight records" },
  { action: "open-board", icon: "board", title: "Leaderboard", detail: "Compare flight scores" },
  { action: "open-account", icon: "account", title: "Account", detail: "Name & save transfer" },
];
