/**
 * Portal policy gates: player-authored text and ad-removal purchases.
 *
 * Both were live in the shipped portal bundle until the Poki compliance pass:
 *
 *  1. The leaderboard rendered a free-text "Pilot name" input, and the name is
 *     broadcast to real players (netlib rooms, race rosters, floating name
 *     tags). Poki's content & player-safety policy allows no unmoderated
 *     player-authored text, and its external-resources policy forbids
 *     collecting personal data — so portal editions render the generated name
 *     read-only with a 🎲 roll instead.
 *  2. Gold's pitch sold "No sponsored breaks, ever". Poki rule REQ-20 forbids
 *     in-app purchases *and* any UI implying them (explicitly: no "remove ads"
 *     purchase). Portals own ad frequency — the game never injects its own
 *     interstitials there (`dueAd` is gated on `portalEnabled()`), so the claim
 *     was also simply untrue.
 *
 * Both are edition flags rather than runtime portal checks so the offending
 * strings are dead-code-eliminated from the portal bundles; the bundle-level
 * half of the gate lives in scripts/portal-markers.mjs and runs in
 * `pnpm verify:portals`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as crazyEdition from "../edition.crazy";
import * as directEdition from "../edition";
import * as genericEdition from "../edition.generic";
import * as pokiEdition from "../edition.poki";

describe("edition policy flags", () => {
  it("direct build keeps free-text names and may sell ad removal", () => {
    expect(directEdition.CUSTOM_PILOT_NAMES).toBe(true);
    expect(directEdition.SELL_AD_REMOVAL).toBe(true);
  });

  it.each([
    ["poki", pokiEdition],
    ["crazy", crazyEdition],
    ["generic", genericEdition],
  ] as const)("%s edition forbids free-text names and ad-removal sales", (_portal, edition) => {
    expect(edition.CUSTOM_PILOT_NAMES).toBe(false);
    expect(edition.SELL_AD_REMOVAL).toBe(false);
  });
});

describe("GOLD.features", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../edition");
  });

  it("drops the ad-removal bullet when the edition cannot sell it", async () => {
    vi.doMock("../edition", async (importOriginal) => ({
      ...(await importOriginal<typeof import("../edition")>()),
      SELL_AD_REMOVAL: false,
    }));

    const { GOLD } = await import("../Economy");

    expect(GOLD.features.some((f) => /sponsored breaks/i.test(f))).toBe(false);
    // The rest of the pitch survives untouched — this is a removal, not a rewrite.
    expect(GOLD.features).toContain("2× coins on every flight");
    expect(GOLD.features).toContain("Unlocks the Nest Pass premium reward track");
    expect(GOLD.features).toHaveLength(6);
  });

  it("keeps the bullet in the direct build", async () => {
    const { GOLD } = await import("../Economy");

    expect(GOLD.features.some((f) => /sponsored breaks/i.test(f))).toBe(true);
    expect(GOLD.features).toHaveLength(7);
  });
});
