# Visual & Polish Audit — Sunbird

Written 2026-09-13. Every number here was **measured**, not eyeballed: there is
no browser in this environment, so nothing in this document is a claim about
how anything *looks*. Where a fix is marked DONE it was verified in the built
bundle or by a test.

---

## 1. Fixed and verified

| Item | Before | After | How verified |
| --- | --- | --- | --- |
| Menu bird sat *on* the sun | `bottom:56%` → 46% of the bird's ink inside the disc, 12px above the rim | `bottom:96%` → ink spans y[-79..-14], 0% overlap, 14px clear | Rasterised the real `sunbirdSVG`/`sunSVG` at the real CSS positions and measured ink bounding boxes |
| Bird's wings overhung into the card | `.hero` padding `0.3 × --hero-sun` = 50px, bird needs 79px | `0.48` = 80.6px; scales (116px clamp min needs 54.6, gets 55.7) | Same measurement |
| Menu sun/bird too small | 64px / 56px fixed | `clamp(116px,34vw,168px)`, bird 76% of it | `dist` CSS contains the clamp |
| Lobby sun clipped | 96px in a fixed 104px strip, `overflow:hidden`, `bottom:-22px` | 168px, fluid 136–180px strip, `bottom:-38px` | `dist` CSS |
| 42px of dead space above the title | `.hero{padding-top:42px}` clearance for a bird that no longer floats | removed | `padding-top:42px` absent from `dist` |
| Sun washed out | `.hero-sun{opacity:.55}` | `1` | `dist` CSS |
| Flat sticker shadows | one soft blur on bird and sun | two layers each (tight contact + wide ambient) | `dist` CSS |
| Hard dithered 3D shadows | `PCFShadowMap`, 1024 map | `PCFSoftShadowMap`, 2048 map | `shadowMap.type=Px`, `Px=2`, `mapSize.width=2048` in `dist` |
| **8 WCAG contrast failures** | 2.60–4.40:1 | all ≥ their threshold | `contrast.test.ts`; re-audit = 48 rules, 0 failures |
| Score repeated identically every pass | 64 fixed slots, byte-identical | 3-phrase variation + chord-tone turnaround fills | `music-variation.test.ts`, mutation-checked |
| Sky read as overcast | flat 3-stop gradient, no bright point | sun bloom in the dome (core + halo + crepuscular rays) | `sunDir`/`sunGlow` in `dist` |
| Murky distance | day fog `0x8ed0ee`, haze `0.04+d*0.055` | fog `0xcfeeff`, haze `0.008+d*0.012`, clouds halved in all 9 biomes | `sky-palette.test.ts` pins luminance/chroma vs the recorded old hex |
| Landmarks drawn twice | second `emit()` of the same spot for occlusion handles | emitted once, handles reused | 1066 → 1051 InstancedMeshes / 20 km |

Checks: **300 tests / 39 files**, `verify:prod` = PRODUCTION READY,
`physcheck` 22/22, `test:mp` 8/8 gates.

---

## 2. Open — the honest punch list, worst first

### A. The bird is painted in flat solid fills. *This is the biggest remaining "cheap" cause.*
`SUNBIRD_PALETTE` is 10 flat colours. `sunbirdSVG` (lines 268–334) contains no
gradient at all; the only `<radialGradient>` in the file is at line 349, inside
`sunSVG`. No rim light, no belly-to-back shading, no ambient occlusion where the
wing meets the body. Flat vector fills with no shading are the single most
reliable tell of amateur 2D art.

**Why it is not done:** `sunbird.test.ts` asserts an *identical fill list*
between the SVG and canvas renderers (26 tests). Gradients mean `url(#id)` on
one side and a `CanvasGradient` object on the other, so the contract itself has
to change — a two-renderer edit to the canonical asset that every bird in the
game is drawn from. Doing that with no way to see the result is how you ship a
broken bird. **Needs a session with a display.**

### B. No motion blur.
FOV widening with dolly-zoom counter-narrow (`CameraRig.ts:145`), bloom
(`Fx.ts`), screen shake and slow-motion peak launch all exist. Actual motion
blur does not. It is the one item on a standard "speed juice" list this game is
missing, and it is a contained post-processing pass.

### C. Wind-spirit spectators.
Eliminated players staying in the round as spirits that can gift boosts or
drafts. Genuinely absent — `grep -i "spirit\|spectator"` over `src/game/` finds
only prose strings, no mechanic. The best retention idea on the table, but it
needs server support to be fair, so it belongs **with** the v1 transport work,
not before it.

### D. The v1 protocol is dead code on the client.
`Realtime.ts` imports only `PROTOCOL_VERSION` from `protocol/v1.ts`. The
contract-pinned `parseServerMessage` is never called by shipped code, and the
two are *different protocols*, not two parsers of one. Building the v1 client
transport is the largest single piece of unfinished work in the repo.

### E. Two fairness gaps, both Rust, neither verifiable here.
Synchronised start can fire before the server signal on edge reconnects, and
signed seat tokens exist but are **not enforced on WS reconnect**. Also: no
interest management — `broadcast()` sends the full pilot array to every socket.

### F. Cannot be verified in this environment, at all.
No browser is installable (`cdn.playwright.dev` unreachable), no Rust toolchain
(no `cargo`/`rustc`, crates.io unreachable). So: no screenshot has ever been
taken of this game, and the Rust edits are type-checked by reading, not by
compiling.

---

## 3. What "worth more" would actually require

Not more visual tweaks. In priority order: the v1 transport (D), then interest
management and the two fairness gaps (E), then the bird shading (A). A and B are
what a player *sees*; D and E are what stops the game breaking at 40 players.
Both matter, and the second list is the one that is currently unstarted.
