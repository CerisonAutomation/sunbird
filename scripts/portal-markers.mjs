/**
 * Cross-portal isolation markers — the machine-checked form of "every version
 * is its own way".
 *
 * A portal bundle must carry its OWN SDK/branding and nothing of any other
 * portal's. This is not hypothetical: the loading-screen failsafe used to hold
 * a raw `window.PokiSDK` fallback behind `if (TARGET !== "poki") return;`, and
 * the minifier folds positive `TARGET === "poki"` branches but NOT that
 * negative early-return — so the string survived into the CrazyGames and
 * generic bundles. The HUD additionally embedded all three portal names in one
 * runtime ternary. Both are now impossible by construction (target-only modules
 * + the edition swap in vite.config.ts); these markers keep them that way.
 *
 * Used by scripts/verify-portal.mjs (built dists, via the zips) and
 * scripts/verify-upload.mjs (the Inspector folder). Add a marker here whenever
 * a new per-target module is introduced.
 */
export const FOREIGN_MARKERS = {
  poki: [
    [/crazygames/i, "CrazyGames marker"],
    [/sdk\.crazygames\.com/, "CrazyGames SDK URL"],
    [/CrazyGames edition/, "CrazyGames edition string"],
  ],
  crazy: [
    [/poki/i, "Poki marker"],
    [/game-cdn\.poki\.com/, "Poki SDK URL"],
    [/netlib\.poki\.io/, "Poki netlib endpoint"],
    [/auds\.poki\.io/, "Poki AUDS endpoint"],
    [/\bPokiSDK\b/, "Poki SDK global"],
    [/Poki edition/, "Poki edition string"],
  ],
  generic: [
    [/poki/i, "Poki marker"],
    [/game-cdn\.poki\.com/, "Poki SDK URL"],
    [/netlib\.poki\.io/, "Poki netlib endpoint"],
    [/auds\.poki\.io/, "Poki AUDS endpoint"],
    [/\bPokiSDK\b/, "Poki SDK global"],
    [/crazygames/i, "CrazyGames marker"],
    [/sdk\.crazygames\.com/, "CrazyGames SDK URL"],
  ],
};

/**
 * Markers that must not appear in ANY portal edition.
 *
 * Chat (Poki REQ-31: "no chat in multiplayer product surfaces — emotes are the
 * recommended alternative"). The club chat surface is a direct-build feature:
 * portal editions have no chat UI at all (`SQUAD_CHAT` in the edition module),
 * no chat polling, and `SquadClient.sendChat` is a dead return. These markers
 * pin the UI contract — the input, its accessible name and its action wiring —
 * so a future renderer cannot quietly reintroduce a message box into a portal
 * build. (Inert remnants are expected and allowed: the `.chat-box` CSS rule and
 * a minified `case"squad-chat":break;` with nothing to trigger it.)
 */
export const PORTAL_FORBIDDEN_MARKERS = [
  [/Message your club/, "club chat input (REQ-31 forbids chat surfaces)"],
  [/chatText/, "club chat input ref"],
  [/data-action=["']squad-chat/, "club chat send button"],
  [/Club chat history/, "club chat log"],
  [/Friends &amp; club chat|Friends & club chat/, "chat promise in the Squad menu copy"],
];

/** Every forbidden marker that appears in `html`, as "reason (matched text)". */
export function foreignMarkersIn(html, portal) {
  const table = FOREIGN_MARKERS[portal];
  if (!table) return [];
  const hits = [];
  for (const [re, why] of [...table, ...PORTAL_FORBIDDEN_MARKERS]) {
    const m = re.exec(html);
    if (m) hits.push(`${why}: "${m[0]}"`);
  }
  return hits;
}
