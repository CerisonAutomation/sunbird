# Sunbird — Mobile Touch & Scroll Audit

> **Date:** 2026-09-20 · **Branch:** `arena/01a0c02b-sunbird` · **Base:** `620c265`
> **Method:** measured, not reviewed. Every number below comes from a real Chromium
> driven over CDP `Input.dispatchTouchEvent` — the same event path a finger takes —
> against a Pixel 7 profile (412×915, DPR 2.625, `isMobile: true`, `hasTouch: true`).
> Each fix was A/B'd by reverting the source and re-running the identical probe.
>
> **Verdict:** the complaint was correct and it had one dominant root cause.
> Menu scrolling was dead across most of every screen, three tap-to-dismiss
> affordances did not exist on touch at all, and the small-screen "performance"
> pass had deleted the game's entire touch-feedback vocabulary. All three are
> fixed and pinned by tests. Two design-level issues are documented, not changed.

---

## 1. Executive summary

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| F1 | Menu cards would not scroll under a finger unless the drag happened to start on a `<button>` | **Critical** | ✅ Fixed |
| F2 | Tap-to-dismiss on non-button surfaces (pause → resume, game over → restart, backdrop → back) was dead on touch | **Critical** | ✅ Fixed |
| F3 | The ≤640px "performance" block froze every animation to 0.01ms, deleting the tap ripple, spinners and three in-game warnings | **Critical** | ✅ Fixed |
| F4 | `transform: none !important` cancelled every button `:active` press state on phones | **High** | ✅ Fixed |
| F5 | Gameplay gestures (dive hold, double-tap boost, gold ripple) fired on touches landing on a menu | **Medium** | ✅ Fixed |
| F6 | Non-passive `touchstart`/`touchmove` on `window` makes every touch on the page pay a main-thread round-trip | **Medium** | ⚠️ Reduced, not removed — see §6 |
| F7 | Nested scroll surfaces with `overscroll-behavior: contain` trap the finger | **Medium** | 📋 Recommended |
| F8 | `user-scalable=no, maximum-scale=1.0` blocks pinch-zoom (WCAG 1.4.4) | **Low** (a11y) | 📋 Documented trade-off |
| F9 | Dead/deprecated declarations: `-webkit-overflow-scrolling`, `scroll-behavior: smooth` on a fixed body | **Low** | 📋 Recommended |

Already correct and left alone: touch-target sizing, tap-delay suppression,
host-page scroll containment, safe-area insets, `pointercancel` recovery,
rotation handling, and the gameplay surface's own `touch-action: none`.

---

## 2. F1 — menu scrolling was dead (the headline bug)

### Symptom

`src/game/Input.ts` bound `touchstart` and `touchmove` on **`window`** with
`{ passive: false }` and called `preventDefault()` for any target that was not
`input, textarea, select, a, summary, label, [contenteditable], button, [data-action]`.

A menu card is mostly plain `<div>`s. So the exempt list covered the buttons and
almost none of the surface *between* them.

### Why that kills scrolling

Chromium only hands a pan to its compositor thread while the first touch events
stay uncancelled. Cancel `touchstart` or the first `touchmove` and the scroll
never begins — the browser keeps dispatching cancelable `touchmove`s to JS
instead of ever taking the gesture over. `touch-action: pan-y` on the card does
not rescue it: `touch-action` decides *which* gestures are permitted, but a
non-passive `preventDefault()` still vetoes them. This is precisely the pattern
Chrome's scrolling-intervention guidance tells authors to stop using.

### Measured, before

Pixel 7 profile, one 340px upward finger drag, `scrollTop` read after settle:

| Screen | Drag started on | Overflowable | `scrollTop` | `touchmove` cancelled | `pointercancel` |
| --- | --- | --- | --- | --- | --- |
| Home menu | `<button class=mode-select>` | 833px | **337px ✓** | 0 / 1 | 1 |
| Home menu | `<div class=destination-grid>` | 833px | **0px ✗** | 32 / 32 | 0 |
| Shop | `<div class=shop-hero>` | 1340px | **0px ✗** | 16 / 16 | 0 |
| Shop (swipes 2, 3) | `<div class=pc-row>` | 1340px | **0px, 0px ✗** | all | 0 |
| Rival Rank | `<div class=season-head>` | 356px | **0px ✗** | 48 / 48 | 0 |
| Island Atlas | `<div class=atlas>` (nested) | 937px | **0px ✗** | 64 / 64 | 0 |
| Nest Pass | `<button class=tier-reward>` | 2862px (`.tier-track`) | **305px ✓** | 0 | 2 |

**The same card, two finger positions ~200px apart: one scrolled 337px, the
other was frozen solid.** That is the "sometimes it works, sometimes it doesn't"
feel that reads as a broken page rather than a bug.

### Causation control

Same drag, same pixel, with `preventDefault()` neutralised at the prototype level:

| Screen | App `preventDefault` active | App `preventDefault` neutralised |
| --- | --- | --- |
| Shop | `scrollTop=0` / 1340px, 16/16 cancelled, 0 `pointercancel` | `scrollTop=337`, 0 cancelled, **1 `pointercancel`** |
| Rival Rank | `scrollTop=0` / 356px, 16/16 cancelled, 0 `pointercancel` | `scrollTop=337`, 0 cancelled, **1 `pointercancel`** |

`pointercancel` is the compositor claiming the gesture — direct proof the scroll
became native rather than scripted.

### Measured, after

| Screen | Overflowable | `scrollTop` | `touchmove` cancelled | `pointercancel` | Long tasks during 4 drags |
| --- | --- | --- | --- | --- | --- |
| Shop | 1340px | **337px ✓** | 0 | 1 | 0 |
| Rival Rank | 356px | **337px ✓** | 0 | 1 | 0 |
| Nest Pass `.tier-track` | 2862px | **305px ✓** | 0 | — | 0 |

Scroll position is also stable now that scrolling exists: 337px held through 4s
of idle re-renders, and `MenuContinuity` restores it on re-entry (1052px on
returning to the shop) — that machinery was already correct, just unreachable.

### Fix

`src/game/Input.ts` — a `SCROLL_SURFACES` selector (`.overlay, .emote-wheel,
[data-scroll-surface]`) consulted by `ownsTouch()`. Touches inside a scroll
surface are never cancelled; `[data-scroll-surface]` is the escape hatch for the
next scroller that does not live in an overlay, and keeps the check a single
`closest()` rather than a `getComputedStyle` walk on a 60Hz event.

Host-page containment — Poki's *"prevent game viewport scrolling from affecting
the parent page"* — is unaffected and re-verified: `body` is
`position: fixed; overflow: hidden; overscroll-behavior: none`, the card is
`overscroll-behavior: contain`, and `window.scrollY` stayed `0` through in-flight
drags and menu drags alike. That containment was always doing the real work; the
`preventDefault()` was redundant on top of it.

---

## 3. F2 — taps on non-button surfaces did not exist

Cancelling `touchstart` also suppresses the compatibility `click`. Three shipped
affordances depend on a click landing on a `<div>`:

```ts
// src/game/HUD.ts — onAction()
if (e.target === this.pauseEl) { handler("resume", ""); return; }
if (e.target === this.overEl)  { handler("restart-flight", ""); return; }
if (e.target === this.menuEl && screen !== "main") { handler("back", ""); return; }
```

| Affordance | Before | After |
| --- | --- | --- |
| Tap bare pause overlay → resume | ✗ `clicks=[]`, `touchstart` prevented on `DIV.overlay` | ✅ **measured** resumed |
| Tap backdrop beside card → back | ✗ stayed on Shop | ✅ **measured** returned home |
| Tap game-over overlay → restart | ✗ same handler shape | ✅ same guard; **not separately measured** — reaching a real game-over in this harness needs a full flight, and `.overlay.gameover` is an `.overlay` so it takes the identical path |

On a phone this meant the pause screen could only be left via its buttons, and
the "tap anywhere" convention players expect from every other mobile game was
silently absent.

---

## 4. F3 + F4 — the small-screen block deleted the feedback vocabulary

`src/index.css` had, under `@media (max-width: 640px)`:

```css
* { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
…
.primary-btn, .soft-btn, .mini-btn, .icon-btn { transform: none !important; }
```

Because `*` carries `!important`, it outranked every `animation` declaration in
the app except those that were themselves `!important` at class specificity
(`.trail-swatch`). Measured on a 412px viewport, before:

| Element | Declared | Computed on a phone | Effect |
| --- | --- | --- | --- |
| `.touch-ripple` | `touch-ripple-expand 0.38s forwards` | `0.00001s` | **never painted** — first rAF sample already `opacity: 0.00, scale 1.65` |
| `.spinner` | `spin 0.8s infinite` | `0.00001s`, 1 iteration | loader never turned |
| `.matchmaking-spinner` | `spin 0.8s infinite` | frozen | room-search loader static |
| `.sun-fill.low` | `pulse 0.8s infinite` | frozen | **low-sun warning dead** |
| `.hand.show` | `press 1s infinite` | frozen | **hold-to-dive tutorial hint dead** |
| `.pu.expiring` | `pu-blink 0.5s infinite` | frozen | **power-up expiry warning dead** |
| `.count-ring` | `pulse 1s infinite` | frozen | continue-offer countdown static |
| `.finish-countdown.close` | `cdurge 0.5s infinite` | frozen | race-finish urgency static |
| `.primary-btn:active` | `transform: translateY(3px)` | overridden by `transform: none !important` | **no press feedback** |

`forwards`-filled animations were worse than cosmetic: a 0.01ms duration jumps
straight to the end keyframe, so the ripple — which ends at `opacity: 0` — was
created, completed and removed without ever being visible.

Stack that with `-webkit-tap-highlight-color: transparent` (global, and correct
for a game) and the result is that **a phone got no confirmation whatsoever that
a button had been pressed**. That is the "touching is terrible" half of the
report, and it was self-inflicted by a perf rule.

### Fix

The perf intent is kept where it is real, and dropped where it was not:

- **Decorative idle loops still frozen** — `.hero-bird`, `.hero-sun`,
  `.hero-sun-wrap`, `.logo-mark`, `.bird-badge.you svg`, `.lobby-bird`,
  `.name-entry-bird`, `.gold-badge.big`, `.zzz`, `.score-table .spark`,
  `.skeleton`, `.loading-placeholder`.
- **`filter`- and `box-shadow`-based pulses swapped to an opacity breath**
  (`pulse-soft`) rather than deleted. These are the two animation costs that are
  genuinely real on a phone GPU, since both repaint instead of compositing. The
  low-sun warning, the busy button and the claimable reward still pulse — on the
  compositor.
- **`transform: none !important` removed.** Its comment said "disable transform
  transitions"; the transition freeze already did that. The `!important`
  transform was cancelling the press states instead.
- **Transitions stay instant** (`* { transition-duration: 0.01ms !important }`) —
  unlike animations, no transition here has a fill mode that can strand an
  element mid-state.

After: `.touch-ripple` `0.38s` and visibly mid-animation at `opacity 1.00`;
`.spinner` `1s infinite`; `.sun-fill.low` `0.8s infinite`. Live animations at
rest on the home screen: **0 before, 0 after** — the ambience stayed off.

---

## 5. F5 — gameplay gestures leaked into menus

`Input` is only disabled during portal ads (`setEnabled(false)` at
`Game.ts:5087`), so it stayed live behind every menu. A finger down on blank
menu background:

| | Before | After |
| --- | --- | --- |
| Gold dive ripple painted over the menu | 1 spawned | **0** |
| `held` armed (dive state set behind the menu) | yes | **no** |
| Double-tap on a menu read as the boost gesture | boost armed | **ignored** |
| Upward flick on a menu read as the boost gesture | boost armed | **ignored** |
| Still counts as the first gesture (audio unlock) | yes | **yes** (deliberately kept) |

The gameplay surface itself is unchanged and re-verified: `touchstart` and every
`touchmove` still cancelled, no `pointercancel`, `window.scrollY === 0`,
`document.documentElement.scrollTop === 0`.

---

## 6. Comparison against published best practice

| Practice | Source | Sunbird before | Sunbird now |
| --- | --- | --- | --- |
| Express "don't scroll here" with `touch-action`, not `preventDefault()` | [Chrome — Making touch scrolling fast by default](https://developer.chrome.com/blog/scrolling-intervention): *"If you call preventDefault() in the touchstart or first touchmove events then you will prevent scrolling"*; *"websites should not rely on calling preventDefault() … Developers should apply the touch-action CSS property"* | ✗ Violated — global non-passive `preventDefault()` on `window` | ✅ `touch-action` is now the mechanism; `preventDefault()` survives only on the gameplay surface as a legacy-engine fallback |
| Document-level touch listeners should be passive | same source: *"if the target of a touchstart or touchmove listener is the window, document or body we default passive to true"* — Sunbird explicitly opted out with `{ passive: false }` | ✗ Opted out globally | ⚠️ Still `{ passive: false }`, but now a no-op for every menu touch. Removing it entirely is the documented end state (see §8) |
| `touch-action` intersects from the hit element up to **the first containing scrolling element** | [MDN — touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action) | ✅ Already correct — `.paper-card` is the scroller, so `touch-action: none` on `body`/`.game-root` does *not* block it. Worth recording: this was **not** the bug, and "ancestor `none` breaks descendant scroll" is a false lead here | ✅ Unchanged |
| `touch-action: manipulation` on controls to kill the 300ms tap delay | [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action), [Patrick Lauke — Getting Touchy](https://patrickhlauke.github.io/getting-touchy-presentation/) | ✅ Present on `button, [data-action]` | ✅ Measured tap→click **108ms**, no delay |
| `overscroll-behavior: contain` to stop scroll chaining | [CSS-Tricks — overscroll-behavior](https://css-tricks.com/almanac/properties/o/overscroll-behavior/) | ✅ `none` on body, `contain` on the card | ✅ Verified `window.scrollY === 0` after every drag |
| Prevent the game viewport from scrolling the parent page | [Poki requirements](https://developers.poki.com/guide/requirements-quality) — *"Page Integration: prevent game viewport scrolling from affecting the parent page"* | ✅ Achieved, but by the wrong mechanism | ✅ Achieved by containment, which is what the rule asks for |
| Touch support and safe areas on mobile | [CrazyGames technical requirements](https://docs.crazygames.com/requirements/technical/) | ✅ `env(safe-area-inset-*)` on HUD + overlays, `viewport-fit=cover` | ✅ Unchanged |
| Animate only `transform` / `opacity` on mobile | [DOM Performance on Mobile](https://dev.to/helloashish99/dom-performance-on-mobile-lab-vs-real-device-reality-5gab) — *"add `{ passive: true }` … check for `getBoundingClientRect()` in scroll handlers"* | ✗ `filter: brightness()` and `box-shadow` pulses ran unfrozen only where `!important` accidentally saved them | ✅ Those two swapped to an opacity pulse on ≤640px |
| Don't freeze feedback to save frames | same, plus the general rule that transform/opacity animations are compositor work | ✗ Blanket `* { animation-duration: 0.01ms !important }` | ✅ Scoped to decorative idle loops |
| 44×44 CSS px minimum target | Apple HIG; WCAG 2.5.5 (AAA) / 2.5.8 (AA, 24×24) | ✅ | ✅ **174 controls across all 17 screens audited; 1 below 44px** — the Race Lobby room-code input at 241×43 |
| Don't block pinch-zoom | [WCAG 1.4.4 Resize Text](https://getwcag.com/en/accessibility-guide/meta-viewport-large); axe `meta-viewport` | ✗ `user-scalable=no, maximum-scale=1.0`; measured pinch → `visualViewport.scale` stays `1.000` | ✗ **Unchanged — deliberate**, see §8 |
| `-webkit-overflow-scrolling: touch` | Deprecated / no-op since iOS 13 ([source](https://dev.to/helloashish99/dom-performance-on-mobile-lab-vs-real-device-reality-5gab)) | ⚠️ Present at 2 sites | ⚠️ Left in place; harmless, see §8 |
| Direction-lock / tap-vs-scroll discrimination | [Prevent touchstart when swiping](https://www.javascriptroom.com/blog/prevent-touchstart-when-swiping/) | ✅ Not needed — the browser now owns the pan, and a verified 8px finger drift on a button still delivers its `click` | ✅ |

---

## 7. What was already right

Worth saying explicitly, because the audit could easily have "fixed" these:

- **Touch targets.** 174 distinct controls across all 17 reachable screens; one
  is under 44px (241×43). `menu-polish.css` enforces `min-height: 44px` on the
  control classes and it holds.
- **No 300ms tap delay.** `touch-action: manipulation` on every control;
  measured 108ms pointerdown→click.
- **Host-page containment.** `body { position: fixed; overflow: hidden;
  overscroll-behavior: none }` + `.paper-card { overscroll-behavior: contain }`
  is exactly right, and is what makes the `preventDefault()` removal safe.
- **The gameplay surface.** `touch-action: none` on `.game-canvas` /
  `.game-root` / `.hud-root` / `.play-hud`, plus `preventDefault()` as a
  legacy-engine fallback, is the textbook setup. Untouched.
- **`pointercancel` and rotation.** `boundPointerCancel` releases holds;
  `splitMode`'s setter drops stale fingers on rotation while preserving
  keyboard/gamepad holds. Well thought through.
- **`pointerId`-keyed multi-touch** with per-player half-screen routing, and the
  duplicate-listener guard (`el` + `window` both bound) is correct.
- **Text inputs** are exempted from `user-select: none` and get
  `touch-action: auto !important`.
- **Input latency** did not regress. Distributions are statistically identical
  before/after under this sandbox's software GL — original `[2,764,202,435]`,
  fixed `[1,898,173,159]` — and live animations at rest went from 0 to 0.

---

## 8. Recommended, not changed

Deliberately left for a human decision, because each is a trade-off rather than a bug.

1. **Drop the non-passive `window` touch listeners (F6).** Now that overlays are
   exempt the handler is a no-op for menus, but the browser still cannot start a
   pan until it returns, so every touch anywhere pays a main-thread round-trip.
   `touch-action: none` on the gameplay surface already does the job on every
   engine that matters (Chrome 36+, Safari 13+, Firefox 52+). The only thing the
   `preventDefault()` still buys is pre-iOS-13 Safari. Deleting
   `boundTouchStart`/`boundTouchMove`/`boundWindowTouchMove` is the documented
   end state and would take the menu scroll fully off the main thread.
   *Not done here because a unit test pins the current behaviour
   (`"prevents default on touchstart for gameplay area…"`), so removing it is a
   policy call, not a bug fix.*
2. **Collapse the nested scrollers (F7).** `.tier-track` holds 2862px in a 340px
   box, `.atlas` 937px in 320px, plus `.board-list` and `.chat-box` — all
   scroll-in-scroll inside the card, all with `overscroll-behavior: contain`, so
   a finger that reaches the end of the inner list stops dead instead of
   chaining out to the card. `menu-polish.css`'s own header comment promises
   *"one scroll surface"*; on a coarse pointer these four break that promise.
   They do scroll now (`.tier-track` measured 305px), so this is polish.
3. **Pinch-zoom (F8).** `maximum-scale=1.0, user-scalable=no` fails WCAG 1.4.4
   and the axe `meta-viewport` rule; a real two-finger pinch leaves
   `visualViewport.scale` at `1.000`. The accessible form is
   `width=device-width, initial-scale=1, viewport-fit=cover`, and
   `touch-action: none` on the gameplay surface would still prevent accidental
   zoom mid-flight. Counter-arguments are real: iOS ≥10 ignores
   `user-scalable=no` anyway, and portal iframes generally want a locked
   viewport. Left as shipped.
4. **Dead declarations (F9).** `-webkit-overflow-scrolling: touch` at
   `menu-polish.css:851` and `ui.css:3051` has been a no-op since iOS 13;
   `scroll-behavior: smooth` on `body, #root` applies to two elements that are
   `position: fixed; overflow: hidden` and can never scroll. Both are safe to
   delete.
5. **The phone visual gate is unenforced.** `visual-baselines.spec.ts` serves
   `poki-upload/` — a tracked-but-stale 1.5MB artifact — rather than a fresh
   build, so it cannot observe source CSS changes at all without a
   `pnpm build:poki` first. On top of that, only `*-desktop-linux.png`
   baselines are committed; the four `*-phone-linux.png` snapshots are missing
   and `playwright.config.ts` sets no `updateSnapshots`, so the phone visual
   tests fail on missing baselines instead of asserting anything. Worth a CI
   note. (Full detail and why I deleted the sandbox-generated renders: §9.)
6. **22 pre-existing e2e failures in this sandbox** (SwiftShader software GL, no
   system fonts, the stale artifact above). Verified identical before and after
   this change — see §9 — but they mask real signal.

---

## 9. Verification

**Regression cover.** 11 new unit tests (`src/game/__tests__/input-ui.test.ts`)
and 9 new browser tests (`e2e/mobile-touch.spec.ts`). Both sets were run against
the *original* source to confirm they actually fail:

| Suite | Against original code | Against the fix |
| --- | --- | --- |
| `input-ui.test.ts` | **7 failed**, 38 passed | 45 passed |
| `e2e/mobile-touch.spec.ts` (phone project) | **7 failed**, 2 passed | 9 passed |

The 2 browser tests that pass either way are intentional controls: the nested
`.tier-track` drag (which started on a button, so it was never broken) and
"the gameplay surface still refuses to scroll or chain" (which must not regress).

The browser spec drives gestures through CDP `Input.dispatchTouchEvent` rather
than `locator.tap()`, because `tap()` only reproduces a touch that lands on a
control — and every bug here came from a finger landing somewhere else. A
`barePixel()` helper finds a pixel inside a container that is *not* covered by
any control, which is what makes the tests pin the actual failure mode.

**No new failures.** Full `--project=phone` run: 56 passed / 26 failed. Each
failing spec was re-run against the original source and produced the *identical*
failure list — 12 functional (`cta-actionability`, `input-standards`,
`journeys`, `menu`, `persistence`×3, `results`×5), 5 portal/artifact
(`poki-artifact`×2, `portal-policy`×3), 5 visual (`visual-locale`×4,
`visual-screens`).

`visual-baselines` deserves its own note, because it initially looked like the
one place a CSS change could bite. It is not: the repo commits only
`*-desktop-linux.png` baselines, so the four `*-phone-linux.png` snapshots did
not exist. `playwright.config.ts` sets no `updateSnapshots`, so Playwright wrote
them on first run and **failed** the test for the missing baseline — then passed
4/4 on my re-run purely because my own first run had created them. They were
sandbox renders (SwiftShader, no system fonts) and have been deleted rather than
committed; committing them would have installed bad baselines as canonical. The
phone visual gate is therefore effectively unenforced today, independent of this
change. Separately, `e2e/visual-helpers.ts` serves `poki-upload/` and never
`dist/` (line 9 says so explicitly), and `poki-upload/` is a tracked-but-stale
artifact — so these specs cannot observe source CSS edits at all without a fresh
`pnpm build:poki`.

**Gates green:** `tsc --noEmit` clean · `tsc -p server/tsconfig.json` clean ·
`eslint src scripts api --max-warnings 0` clean · `vitest run` **1176 passed,
8 skipped** (was 1165) · `vite build` clean · `scripts/audit-ui.mjs` PASSED
(17 pre-existing warnings).

---

## 10. Files changed

| File | Change |
| --- | --- |
| `src/game/Input.ts` | `SCROLL_SURFACES` selector + `isScrollSurface()` / `isOverlaySurface()` / `ownsTouch()`; overlay touches are never cancelled and never arm a gameplay gesture; the three duplicated touch handlers collapse into one |
| `src/index.css` | ≤640px block: blanket animation freeze replaced with a decorative-only list; `filter`/`box-shadow` pulses swapped to compositor-only `pulse-soft`; `transform: none !important` on buttons removed |
| `src/game/__tests__/input-ui.test.ts` | +11 tests, new `describe("menu overlays keep native scrolling and tapping")` |
| `e2e/mobile-touch.spec.ts` | new — 9 browser tests over real CDP touch |
