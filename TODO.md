# Sunbird polish loop

## Pass inputs
- [ ] Assessment A (visual design review) findings in
- [ ] Assessment B (functional / performance / Poki gaps) findings in

## Known defects already fixed this session, awaiting the push
- [x] Rewarded CTA offered on a build check while the action required a live ad
      surface — "Watch for Second Wind" was inert (offer + shop card now gated on
      adsLive; six DOM tests pin the surfaces)
- [x] `happytime()` -> `happyTime()` and `hasAdBlock()` -> `isAdBlocked()`: two
      calls that do not exist on the real SDK, so celebrations never fired and the
      ad-block probe always said no
- [x] A portal break can no longer hold the game hostage (120s guard, MON-12)

## Structural finding (measured before pass 1, no screen tweaking fixes it)
- [ ] P0: there is effectively NO design system. 11,437 lines of CSS across
      index.css / ui.css / menu-polish.css define **19** design tokens, while
      using **~2,945 raw colour values** (1,897 hex + 1,048 rgb()), and those hex
      values are **932 distinct colours** — the most repeated one appears 86
      times out of ~2,945, so nothing is *the* brand colour.
- [ ] P0: `menu-polish.css` is an override layer, not a stylesheet: 1,731
      declarations, of which `background` 208, `border` 154, `box-shadow` 150,
      `color` 145, `border-radius` 109, `padding` 90 — and **1,483 `!important`**
      (against 13 in ui.css and 16 in index.css). It fights the layer beneath it
      instead of defining anything, which is why each "polish" pass adds another
      override and the visual noise survives.
- Consequence for this loop: per-screen polish will keep failing until the token
  layer exists. Pass 1 should extract tokens for the values that already repeat
  (the palette above plus spacing/radius/shadow) and make ONE screen consume them
  — not restyle 11k lines.

## Loop passes
- [ ] Pass 1 — verdict, fix, verify, record
- [ ] Pass 2
- [ ] Pass 3
- [ ] Pass 4
- [ ] Pass 5
- [ ] Pass 6
- [ ] Pass 7
- [ ] Pass 8
- [ ] Pass 9
- [ ] Pass 10

## Completion
- [ ] ALL_TASKS_COMPLETE
