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

/** Every foreign marker that appears in `html`, as "reason (matched text)". */
export function foreignMarkersIn(html, portal) {
  const table = FOREIGN_MARKERS[portal];
  if (!table) return [];
  const hits = [];
  for (const [re, why] of table) {
    const m = re.exec(html);
    if (m) hits.push(`${why}: "${m[0]}"`);
  }
  return hits;
}
