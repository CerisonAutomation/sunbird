# Sunbird Portal Builds

Sunbird ships four explicit build targets through `VITE_PORTAL_TARGET`:

| Target | Monetization path | Direct Stripe / VIP UI | Notes |
| --- | --- | --- | --- |
| `none` | Standalone/PWA model | Enabled | Default local and self-hosted build. |
| `poki` | Poki SDK commercial + rewarded breaks | Disabled | No banner integration. |
| `crazy` | CrazyGames SDK midgame + rewarded breaks | Disabled | Optional dashboard banner slot. |
| `generic` | None (clean build) | Disabled | For every other HTML5 portal — see matrix below. |

## Build commands

```bash
npm run build:poki      # → sunbird-poki.zip
npm run build:crazy     # → sunbird-crazy.zip
npm run build:generic   # → sunbird-generic.zip
npm run build:portals   # all three
```

Each zip is fully self-contained (single inlined `index.html` + `icons/` + `fonts/`),
uses **only relative asset paths** (`base: "./"`), and boots from any subdirectory
of any CDN — verified by serving the zip from a deep subpath and playing it.

## Portal compliance matrix (what each portal checks, and how Sunbird passes)

| Requirement | Enforced by | How Sunbird complies |
| --- | --- | --- |
| No external payment providers | Poki, CrazyGames, GD, Yandex | Stripe is imported via `@stripe/stripe-js/pure` (no script injection at import) **and** `ensureStripeJs()` refuses to run in any portal build. Paywall/checkout actions are double-gated. Verified: zero requests to `js.stripe.com` from portal zips. |
| No external links out of the iframe | All portals | The only `window.open` is the Stripe tab — hard-gated behind `!isPortalBuild()`. No `<a href>` to external sites anywhere in the UI. |
| Relative asset paths (served from CDN subpaths) | All portals | `base: "./"` in vite config; no absolute `/asset` references (grep-verified in built html). |
| Silent when tab is hidden | CrazyGames QA, Poki QA | `visibilitychange` pauses gameplay **and** hard-mutes the master audio bus (`setHiddenMuted`). |
| Silent + input-locked during ads | Poki, CrazyGames | `onAdOpened` → input disabled + master mute; `onAdClosed` restores. |
| Audio only after user gesture | Chrome autoplay policy, all portals | `AudioContext` resumes exclusively inside input callbacks. |
| `gameplayStart`/`gameplayStop` fired correctly | Poki, CrazyGames | Emitted on every transition in/out of the `playing` state. |
| Loading-finished signal | Poki (`gameLoadingFinished`), CrazyGames (`loadingStop`) | Fired once boot completes; SDK load capped at 6 s so a blocked SDK never hangs the game. |
| Works in a sandboxed/cross-origin iframe | All portals | Every `localStorage` access is try-wrapped with in-memory fallback; no service worker in portal builds; no `window.top` access beyond a try-wrapped embed check. |
| No install prompts / PWA UX | All portals | `beforeinstallprompt` capture is suppressed in portal builds; manifest link stripped from portal zips. |
| No file downloads | Poki QA | Share falls back to clipboard-copy in portal builds instead of downloading the image card. |
| Keyboard + mouse + touch all fully playable | All portals | One-button design; space/click/touch all drive the same input path; arrows/space `preventDefault`ed so the host page never scrolls. |
| Landscape + portrait both usable | CrazyGames (desktop-first), Poki (mobile-first) | Fluid layout; HUD verified at 1280×720 and 420×800. |
| Ad frequency sane / no forced pre-roll spam | Poki | Commercial break only at the death→restart seam; rewarded only on explicit user choice ("Second Wind"). |
| Runs offline once loaded (no hard network deps) | GD, Yandex | Multiplayer/leaderboard endpoints are compile-time empty in portal builds; the game silently runs local ghosts + local boards. |
| No PII collection / no cookies | GDPR, all portals | No accounts, no cookies; a random device id in localStorage; telemetry logs to console only (no endpoint). |

### Portals covered by `sunbird-generic.zip`

GameDistribution, Yandex Games, itch.io, Newgrounds, GameMonetize, Lagged,
Coolmath Games, Kongregate, Armor Games, GamePix, Famobi, SoftGames. The
generic target applies **all** portal restrictions (no payments, no installs,
no downloads, no external requests at all) with no ads SDK — portals that
require their own SDK wrapper can inject it around the zip, and the game's
`window`-level cleanliness means no conflicts.

> Yandex Games note: Yandex requires their SDK to be called for their ads.
> Upload the generic zip for review; if they request SDK integration, add a
> `yandex` adapter to `src/sdk/platform.ts` following the CrazyGames pattern
> (~40 lines).

## Runtime Sequence

1. The menu becomes interactive immediately; portal SDK setup runs in parallel.
2. When ready, the adapter emits the portal loading-complete signal.
3. Every transition into active play emits `gameplayStart`; pause, death, continue, and menu emit `gameplayStop`.
4. Portal builds request a commercial break only at the death-to-restart seam.
5. A Second Wind requests a rewarded break. The run resumes only when the SDK returns a positive reward result.
6. While an ad is open, Sunbird disables all input and mutes the master audio bus.
7. While the tab is hidden, gameplay pauses and the master bus is muted.

## Portal QA Checklist

- Use a current Chrome, Edge, Firefox, or Safari browser with WebGL hardware acceleration enabled.
- Boot the zip from a subdirectory (portals never serve from `/`) — Sunbird's relative base handles this.
- Confirm zero external requests in portal builds beyond the portal's own SDK.
- Confirm the game is silent when the tab is hidden and while ads play.
- Confirm keyboard-only, mouse-only, and touch-only playthroughs all work.
