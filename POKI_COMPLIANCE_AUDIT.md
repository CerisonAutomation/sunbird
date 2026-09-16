# Sunbird × Poki — Full Developer-Docs Compliance Audit

**Date:** 2026-09-16 · **Artifact:** `sunbird-poki.zip` (697 KB) · **Build:** this branch, `pnpm build:portals`
**Verdict:** ✅ **Shippable** — every hard requirement passes (several with this audit's fixes baked in); remaining items are submission-time actions, not code blockers.

## Re-verification (2026-09-16, post perf pass)

Re-checked against the current developers.poki.com docs and re-ran every gate on the
rebuilt zips:

- **`gameLoadingFinished()` is now one-shot** in the Poki adapter. `Game` calls both
  `loadingFinished()` and `signalGameReady()` on boot; both previously resolved to a
  `gameLoadingFinished()` call, i.e. two consecutive identical phase markers. The
  "no consecutive duplicates" rule (enforced by the Inspector, stated for gameplay events
  and now applied to the loading signal) is honored. — `src/sdk/poki.ts`
- **Event-order table re-verified** (startup / death→restart / death→revive / pause→resume):
  all match `GameplayEventSink` + the `setState` transitions. `gameplayStart()` on first
  input (not load) confirmed by the state machine.
- **`PokiSDK.login()`** (current API: page-reloads on first login, resolves instantly if
  already logged in) is **deliberately not called at boot** — identity is passive
  (`getUser()`), with the local pilot name as fallback. Optional post-launch follow-up:
  an explicit "Sign in with Poki" button on the profile screen.
- **`poki-cli`** (github.com/poki/poki-cli) can upload from CI — not wired yet; Inspector
  folder upload is the working path today.
- **Perf pass landed** (see `HANDOFF.md` §3): tiered AI fidelity, nametag DOM reuse,
  no per-frame standings sort, snapshot gating, end-of-race pileup removal. All measured
  by `massrace-perf.test.ts` and `physics-perf.test.ts` guards.
- Gates re-run on the rebuilt zips: `verify-portal.mjs` PASS · `audit-zips.mjs` PASS ·
  `verify-prod.mjs` PASS · full unit suite green.

Every requirement below was checked against the actual source **and** the built poki bundle (greps of the unzipped zip). Statuses:

- **PASS** — requirement met; evidence given
- **PASS (bundle-verified)** — verified by grepping the built `sunbird-poki.zip`
- **FIXED** — this audit found a real gap and the fix is in this branch
- **N/A** — requirement does not apply to this build; reason given
- **ACTION** — must be done in the Poki for Developers portal at submission (not code)
- **DEFERRED** — depends on the game being live (Poki game id)

---

## Sources audited

| Doc | URL |
|---|---|
| Requirements & quality guidelines | developers.poki.com/guide/requirements-quality |
| SDK overview & events | developers.poki.com/guide/sdk-overview |
| External resources policy | developers.poki.com/guide/external-resources-policy |
| Content & player safety | developers.poki.com/guide/content-player-safety |
| Working with Poki (revenue, exclusivity, tools) | developers.poki.com/guide/working-with-poki |
| Poki Inspector | developers.poki.com/guide/inspector |
| AUDS (Arbitrary User Data Store) | developers.poki.com/guide/auds |
| SDK reference (HTML5) | sdk.poki.com (sdk-documentation, engine guides) |

---

## 1. Hard requirements

| # | Requirement | Status | Evidence |
|---|---|---|---|
| H1 | Desktop, mobile **and tablet** support; mobile full-screen; tablets forced onto mobile scheme | **PASS (FIXED)** | Canvas fills any viewport (e2e `layout.spec.ts` desktop 1280×800 + phone Pixel 7; `hud-layout.test.ts`). **Fix:** `Game.ts` constructor now classifies tablets as mobile — old `/Mobi\|Android/ + width<700` missed iPads (desktop-ish UA, 744–1024px). Now: `iPad/iPod` in UA regex **or** `isCoarsePointer()` (touch primary pointer) **or** width<700 (`src/sdk/platform.ts`). |
| H2 | Scale to cover the full canvas (16:9 guidance: 640×360 / 836×470 / 1031×580) | **PASS** | Fixed logical world height (480) scaled to the real canvas; sky + terrain fill edge-to-edge (no letterbox bars). UI fit asserted in e2e at both device viewports. |
| H3 | Incognito support — localStorage in try/catch, game stays playable | **PASS** | `src/game/Storage.ts` facade wraps every storage access; falls back localStorage → sessionStorage → memory. 5 tests in `src/game/__tests__/storage.test.ts` including a simulated throwing-storage (incognito) world. |
| H4 | No external requests — bundle fonts/assets/libraries | **PASS (bundle-verified)** | Vite `singlefile` build: one inlined HTML (1.48 MB). `scripts/audit-zips.mjs` URL inventory of the zip: only `react.dev/errors` (React error message, not fetched) and a `jcgt.org` citation string. SDK CDN is the portal's own exception. No fonts, images or code fetched at runtime. |
| H5 | No branding or external ads; studio logo on loading screen OK; no outgoing links | **PASS (bundle-verified)** | Zero `<a>` tags, zero `window.open`, zero third-party ad literals in the poki zip (audit script asserts). The loading shell shows the Sunbird wordmark only — explicitly permitted. |
| H6 | No ad-block prevention; playable with a blocker active | **PASS** | No blocker detection, no messaging, no circumvention. `rewardedBreak()` resolving `false` (the blocker/reject path) grants **no** reward and the game continues via the standard options. |

## 2. SDK integration (technical standards)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| S1 | `gameLoadingFinished()` fired when loading completes | **PASS** | Fired once the first frame renders: `Game.ts` init → `adapter.loadingFinished()`; `gameLoadingStart()` fired right after SDK init in `src/sdk/platform.ts` (bootstrap order per SDK docs). |
| S2 | `gameplayStart()` on the player's **first input**, not on load | **PASS** | Only fires when state enters `"playing"` — a run, which always starts from a player action (launch/tap/keydown). Nothing fires it at boot. |
| S3 | `gameplayStop()` on **any** gameplay interruption (pause, menu, level end, cutscene) | **PASS** | Every transition out of `"playing"` (pause, gameover, continue, ad, menu) routes through `setState` → sink. |
| S4 | **No event may fire twice in succession** (start-after-start, stop-after-stop forbidden) | **PASS (FIXED — this audit's main finding)** | The previous "defensive" `gameplayStop()` in `beginPortalAd()` re-sent stop on the normal death→break path → exactly the forbidden `stop, stop` sequence. **Fix:** new `src/game/GameplayEvents.ts` `GameplayEventSink` — every `gameplayStart/Stop` emission (state machine, late-SDK landing, ad-end catch-up) funnels through one sink that records the last phase actually sent and suppresses repeats. 6 unit tests in `src/game/__tests__/gameplay-events.test.ts` (double-stop bug, double-start, pause/resume ping-pong, late-adapter replay). Verified in bundle: `portal_reward_request` telemetry key (dead flow) DCE'd, sink logic present. |
| S5 | No SDK events possible **during** midrolls/rewarded videos | **PASS** | While state is `"ad"`: input disabled (`beginPortalAd`), every portal `onPause` path is `if (this.state === "playing")`-guarded, and the late-landing sync is sink-deduped. Only legal emission from `"ad"` is the `start` after the break resolves. |
| S6 | `commercialBreak()` only when **exiting pause / heading back into gameplay** | **PASS (FIXED)** | Two placements, both doc-legal: (a) death→restart (`restartWithPortalBreak`) — the documented *Death and restart* order; (b) **new this audit:** pause→resume now routes through `resumeFromPause()` → `commercialBreak()` — the documented *Pause/unpause* order (requirements explicitly mark "closing a Pause menu and heading into gameplay" as ✅). A rejected/absent break resolves instantly; the resume never wedges (state re-checked after the await). No break is fired from menus/level-select (the ❌ case). |
| S7 | `rewardedBreak()` only on the player's explicit choice, with clear advance notice | **PASS** | One rewarded placement: the "🎬 Watch for Second Wind" button on the continue screen — an explicit tap; the ad overlay header says "Sponsored break". |
| S8 | Clean build — no dev tools, debug code, test artifacts | **PASS (bundle-verified)** | `setDebug(true)` gated behind `import.meta.env.DEV` (folds out of builds). No sourcemaps in zip. Telemetry debug no-ops in portal builds. Dead rewarded-VIP flow removed this audit (bundle-verified gone). |
| S9 | Save system where appropriate | **PASS** | Full save pipeline (`SaveData.ts`); on the portal, cloud save falls back to a wrapped localStorage store (`localCloudFallback` + `Storage.ts`) — progress persists across sessions where the portal allows it. |
| S10 | Small file size (players bounce after ~10 s) | **PASS (bundle-verified)** | **683 KB zipped** (1.48 MB single HTML). Single inlined asset — worst-case load is one request. |

## 3. Platform integration

| # | Requirement | Status | Evidence |
|---|---|---|---|
| P1 | Static + animated game thumbnails | **ACTION** | Created/uploaded in Poki for Developers at submission (not part of the zip). See §7 checklist. |
| P2 | Viewport scrolling must not affect the parent page | **PASS** | `overscroll-behavior: none` + `touch-action: none` on the play surface (`index.css`, `Input.ts` pointer/touch handlers call `preventDefault` on scroll-inducing gestures). |
| P3 | Mobile control scheme forced on tablets | **PASS (FIXED)** | Same fix as H1 — `isCoarsePointer()` + `iPad` UA coverage. |
| P4 | Responsive design across screen sizes/inputs | **PASS** | e2e `layout`/`menu-layout`/`results-layout`/`session-layout` fixtures at desktop + phone; unit `hud-layout.test.ts`; input accepts keyboard, mouse, touch, gamepad uniformly. |
| P5 | In-game privacy policy if linking externally | **N/A** | Portal build contains **no** external links at all (bundle-verified), so the clause doesn't trigger. |

## 4. UI / UX

| # | Requirement | Status | Evidence |
|---|---|---|---|
| U1 | Streamlined entry — minimal menus, near-direct gameplay | **PASS** | One-tap "Fly now" from the menu; optional destinations (race, squad, shop) are secondary. |
| U2 | Keyboard: ESC or spacebar pause/resume, with correct SDK events | **PASS** | `Input.ts`: ESC/P toggle pause, Space/A flap, R restart. Pause/resume fire stop/start through the sink (S3/S4). |
| U3 | Cutscenes/intros skippable | **N/A** | No cutscenes; the attract-mode menu flight is left by simply playing. |
| U4 | Clear, visual, non-text-heavy instructions | **PASS** | First-flight coach marks; launch label is the input-agnostic "Hold to dive · release to glide" — reads identically for touch/mouse/keyboard. |
| U5 | Adaptive controls (right scheme per device) | **PASS** | One unified hold/release interaction; no device-specific instruction text to get wrong. Accessibility note: single-button input also makes the game playable with any one key, mouse-only, or touch-only. |

## 5. Localization

| # | Requirement | Status | Evidence |
|---|---|---|---|
| L1 | Multiple languages | **PASS** | 10 languages in `src/i18n` (translation barrel + tests). |
| L2 | Layouts adapt to longer translations | **PASS** | e2e layout fixtures assert no overflow at the reference locales; HUD text containers use wrapping/flex layouts. |

## 6. Advertisement integration

| # | Requirement | Status | Evidence |
|---|---|---|---|
| A1 | `commercialBreak()` and/or `rewardedBreak()` implemented appropriately | **PASS** | Both: commercial on death→restart + pause→resume (new); rewarded on the continue screen. |
| A2 | Game audio auto-muted during ads | **PASS** | `beginPortalAd()` → `audio.setAdMuted(true)`; restored in `endPortalAd()`. Input frozen for the ad's duration too. |
| A3 | No internal ad timers / frequency manipulation | **PASS** | No cooldown, no timer gates any break call. (The continue screen's countdown is a game-timer for the free "let it sleep" path, not an ad timer.) Poki decides whether any given call shows an ad. |
| A4 | One video per reward, max | **PASS** | Continue = exactly one `rewardedBreak()`, reward granted once via the returned boolean. |
| A5 | **Always** a standard continue alternative to the rewarded one | **PASS** | "Spend ● N" (coins) **and** "Let it sleep" (free) are always rendered on the continue screen (`HUD.ts renderContinue`), independently of `adAvailable`. |
| A6 | Standard + reward options appear simultaneously | **PASS** | All three render in the same card pass (no step-wizard gating the ad behind steps). |
| A7 | Standard button ≥ reward button size | **PASS** | Standard `.primary-btn` (18 px font, 12 px padding, 100 % width) vs reward `.soft-btn.wide` (14 px font, 10 px padding) — standard is larger on every axis. |
| A8 | Standard positioned next to or above the reward | **PASS** | The coins button renders directly **above** the reward button; the free sleep option below it. |
| A9 | Rewarded button must **not** be green | **PASS** | `.soft-btn` is a warm neutral (`rgba(42,28,40,.08)` on cream, ink text). The game's action color is orange; gold is reserved for the Gold pass. No green anywhere on the rewarded CTA. |
| A10 | Prominent 🎬 video icon on all reward buttons | **PASS (FIXED)** | Button read `▶ Watch…` — a play triangle, not the documented clapperboard. **Fix:** now `🎬 Watch for Second Wind` (bundle-verified: 🎬 present in the poki zip). |
| A11 | Reward confirmation (animation/sound/celebration) | **PASS** | Coin grant toast + run resumes immediately with the revive jingle and slow-mo restore. |
| A12 | Immediate application of rewards | **PASS** | Continue resumes the live run in place (no menu detour); VIP/coins apply on grant. |
| A13 | No double-rewarding | **PASS** | The `earned` boolean is the single source; the continue flow has one grant site (`doContinue("portal_rewarded")`). |
| A14 | No reward when a blocker is detected | **PASS** | `rewardedBreak()` → `false` ⇒ no grant, no retry loop, fallback options offered. |
| A15 | Silent handling — no custom "ad blocked" messages | **PASS** | The failure toast says "No reward this time — try coins or rest" — it never mentions ad blocking; Poki owns that communication. |

## 7. Content & community / monetization best practices

| # | Requirement | Status | Evidence |
|---|---|---|---|
| C1 | Profanity filtering for multiplayer username input | **N/A (portal)** | The portal build ships **no chat** (multiplayer server UI is excluded from portal builds — chat systems are flatly disallowed on Poki regardless). The local pilot-name input is regex-sanitized. The server-backed social product is a separate artifact outside the portal. |
| C2 | No in-app purchases / no "buy currency" or "remove ads" UI | **PASS (bundle-verified)** | `CoinPaymentProvider` only — everything is bought with **earned** coins. No real-money literals (no `stripe`, no store links — verified in the bundle). The "✦ Remove breaks" gold UI is **local-build-only**: `renderAd` has a portal branch that renders just the "Poki break / run paused" placeholder (no fake creative, no skip, no removal). |
| C3 | Platform-only monetization (Poki ads only) | **PASS** | All ad surface is the Poki SDK. |
| C4 | External links must go through `openExternalLink` | **N/A** | Zero external links in the portal build (bundle-verified). Sharing uses the portal's own share flow (`shareableURL` → Web Share API). |
| C5 | No in-app purchases available on Poki | **PASS** | None. |
| C6 | No secondary currencies (dual economies) | **PASS** | One spendable currency (coins). VIP and Gold are **statuses**, not spendable currencies. (This audit removed the last dual-track remnant: the dead "watch for +500 VIP coins" flow — `portal_reward_request` telemetry key no longer exists in the bundle.) |
| C7 | No third-party ad systems | **PASS (bundle-verified)** | Audit script asserts absence of every non-Poki ad literal in the poki zip. |
| C8 | No ad-timer manipulation | **PASS** | See A3. |
| C9 | No reward-walling core gameplay | **PASS** | Continue is optional — restarting for free is always one tap away; nothing is gated behind an ad. |
| C10 | No pushy prompts toward rewarded videos | **PASS** | Exactly one rewarded placement (continue screen), shown only after a death, with equal-weight standard alternatives (A5–A8). |
| C11 | No misleading buttons | **PASS (FIXED)** | 🎬 icon (A10), distinct warm-neutral styling (A9), honest label "Watch for Second Wind", positioned below the primary standard button (A8). |
| C12 | Content & player safety (all-ages) | **PASS** | Family-friendly bird-flight world; no violence, fear, sexual content, gambling, substances, bullying mechanics; no PII collection (no email/social login; `getUser` is display-only and never stored); no chat. |
| C13 | Originality — inspired, not imitated | **PASS (judgment)** | Not a clone: original art (procedural biomes, custom UI), an economy/progression layer (nest, trails, biomes, VIP) absent from the reference genre, original characters and audio. See "Inspired, not imitated" dimensions — art, mechanics twist (biome/campaign layer), economy, UI, characters, name are all distinct. |
| C14 | AI-assisted production rules (no watermarks/prompt text, process documented on request) | **PASS** | No AI watermarks or prompt text anywhere in assets/UI (bundle-verified: no such strings). Creation process (git history) is available on request. |

## 8. Working-with-Poki / business

| # | Item | Status | Evidence |
|---|---|---|---|
| B1 | Revenue split (100 % search/owned traffic, 50/50 Poki-driven) — informational | **N/A** | Platform policy; nothing to implement. |
| B2 | **Web exclusivity** (no Steam/app stores/console for the Poki build) | **ACTION** | Business commitment at submission. Note: the *generic* zip is a separate artifact for non-exclusive portals (itch.io, GameDistribution…) — keeping the builds separate is exactly what allows the exclusivity pledge on the Poki artifact. |
| B3 | AUDS (Arbitrary User Data Store) for cross-player data | **DEFERRED** | AUDS is a **prototype** that requires the game to be live with a Poki game id (`auds.poki.io/v0/<game-id>/...`). Current cloud save (wrapped localStorage) works within the constraints. Post-launch: consider AUDS for a global leaderboard / shared ghost — the leaderboard already has a clean `Leaderboard.ts` seam for a server backend. |
| B4 | Netlib (multiplayer infra) | **DEFERRED** | Portal multiplayer is intentionally out of the first submission (Poki requires approval for external game servers; our WS server is separate infrastructure). Single-player submit first; Netlib/server approval later if data justifies. |

## 9. Inspector & QA readiness

The [Poki Inspector](https://inspector.poki.dev/) runs the unzipped folder and auto-flags SDK event sequences, external resources, and image weights.

| Item | Status |
|---|---|
| SDK event log (the S1–S7 sequences) | **PASS by construction** — the sink + state machine guarantee the documented orders; the Inspector's Event Log is the final visual confirmation (ACTION below). |
| External Resources warning | Expected **zero** (bundle-verified URL inventory). |
| Image Optimization warning | Expected none — the build has no raster images to compress (procedural visuals). |
| Unexpected Behavior Detected | Expected none — no `window.open`, dialogs, navigation, or storage writes outside the wrapped facade. |
| Scaling Tests (640×360 / 836×470 / 1031×580 + devices) | e2e already covers 1280×800 + Pixel 7; the Inspector scaling pass is the final check (ACTION). |
| Mobile-mode QR test | Covers H1/P3 on real hardware (ACTION). |

---

## 10. This audit's fix log (all in this branch)

| Fix | Why (Poki rule) | Where |
|---|---|---|
| `GameplayEventSink` dedupes every `gameplayStart/Stop` emission; removed the defensive `gameplayStop()` re-send in `beginPortalAd()` | "A `gameplayStop()` cannot fire after another `gameplayStop()`" — the old code produced exactly that on death→break | `src/game/GameplayEvents.ts`, `Game.ts` (setState, init-landing, endPortalAd, beginPortalAd) |
| Pause→resume now routes through `commercialBreak()` on portals | Documented *Pause/unpause* order: stop → commercialBreak → start | `Game.ts resumeFromPause()` + both resume call sites (button, ESC/P hotkey) |
| 🎬 clapperboard icon on the rewarded continue button | "All reward buttons include prominent 🎬 icons" | `src/game/HUD.ts renderContinue` |
| Tablets (iPad et al.) classified as mobile | "Automatically force mobile control schemes on tablet devices" | `Game.ts` constructor + exported `isCoarsePointer()` |
| Removed dead `portal-vip-ad` handler / `earnPortalVipCoins` / `VIP.coinAdReward` | Clean build; also removes the last dual-currency remnant (C6) | `Game.ts`, `Economy.ts`, `economy.test.ts` |

Re-verified after fixes: `tsc --noEmit` clean · eslint 0 warnings · 889/889 tests · `pnpm build` + `build:portals` OK · `verify-portal.mjs` PASS · `audit-zips.mjs` PASS (distinct hashes: poki `b4b7fcbbedcabf5b`, crazy `31f2a5aa9fd71c15`, generic `e3b7253891f80e5f`).

## 11. Submission checklist (portal-side, not code)

1. Upload `sunbird-poki.zip`'s **folder** (unzipped, `index.html` at root) to the Poki Inspector → walk every QA module, confirm the Event Log shows the S1–S7 sequences, run Desktop + Mobile (QR) + Scaling Tests.
2. Upload static + animated thumbnails (P1).
3. Confirm **web exclusivity** for the Poki build in the submission (B2) — keep publishing the generic build to other portals from `sunbird-generic.zip`.
4. Keep the direct/social build (Rust WS server) out of the Poki artifact (already true — C1).
5. Post-launch: decide on AUDS (global board / shared ghosts) and Netlib/server approval for portal multiplayer (B3/B4).
