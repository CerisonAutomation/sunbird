# Sunbird Portal Builds

Sunbird now supports three explicit build targets through `VITE_PORTAL_TARGET`:

| Target | Monetization path | Direct Stripe / VIP UI | Notes |
| --- | --- | --- | --- |
| `none` | Standalone/PWA model | Enabled | Default local and self-hosted build. |
| `poki` | Poki SDK commercial + rewarded breaks | Disabled | No banner integration. |
| `crazy` | CrazyGames SDK midgame + rewarded breaks | Disabled | Optional dashboard banner slot. |

## Build Settings

Create a local `.env` file from `.env.example` and choose one target per build:

```dotenv
# Standalone / itch.io / direct hosting
VITE_PORTAL_TARGET=none

# Poki upload export
# VITE_PORTAL_TARGET=poki

# CrazyGames upload export
# VITE_PORTAL_TARGET=crazy
# VITE_CRAZY_BANNER_ID=your-approved-banner-placement
```

The adapter injects only the SDK belonging to that target at runtime. It uses a singleton SDK bootstrap but binds fresh callbacks to each game instance, so React StrictMode cannot duplicate portal initialization or leave stale audio/input handlers.

## Runtime Sequence

1. The menu becomes interactive immediately; portal SDK setup runs in parallel.
2. When ready, the adapter emits the portal loading-complete signal.
3. Every transition into active play emits `gameplayStart`; pause, death, continue, and menu emit `gameplayStop`.
4. Portal builds request a commercial break only at the death-to-restart seam.
5. A Second Wind requests a rewarded break. The run resumes only when the SDK returns a positive reward result.
6. While an ad is open, Sunbird disables all input and mutes the master audio bus.

## Portal QA Checklist

- Use a current Chrome, Edge, Firefox, or Safari browser with WebGL hardware acceleration enabled.
- Confirm `VITE_PORTAL_TARGET` contains only one portal target for the artifact being uploaded.
- Confirm no Stripe links, standalone paywall CTA, or fake interstitial creative appears in portal mode.
- Confirm restart still proceeds if an SDK declines an ad opportunity.
- Confirm a declined rewarded break returns to the Second Wind screen without granting the reward.
- Verify full-canvas 16:9 and portrait split-screen play, mute, pause, and keyboard/gamepad controls.
- Test at least one clean run, failed run, rewarded Second Wind, and restart on the target portal sandbox.

## Live Stripe Note

Keep `VITE_PORTAL_TARGET=none` for direct/itch.io/PWA builds that use Stripe. Do not ship Stripe, external ads, or fake ad screens in a portal artifact; portals control monetization through their SDKs.