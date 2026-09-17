# Sunbird × Poki — Submission Checklist

**Status:** ✅ ready for the Inspector pass — every automated gate is green
**Date:** 2026-09-17
**Source of truth:** [`docs/poki/COMPLIANCE.md`](./docs/poki/COMPLIANCE.md) is **generated** by `pnpm poki:audit` from the extracted guide (`docs/poki/requirements.json`). This file is the human walkthrough; if the two ever disagree, the generated one wins.

## Pre-submission verification

### Code quality

- [x] TypeScript: **PASS** (0 errors, `pnpm typecheck` + `typecheck:server`)
- [x] Unit tests: **1021 PASS** (75 files, `pnpm test`)
- [x] Server tests: **7 PASS** (`pnpm test:server`)
- [x] Lint: **PASS** (`pnpm lint`, `--max-warnings 0`)
- [x] Build: **PASS** (`pnpm build`, `pnpm build:portals`)
- [x] Extracted-rule audit: **99/113 verified, 0 failures** (`pnpm poki:audit --run`)

### Artifacts

| Artifact | Size | Verified by |
|---|---|---|
| `sunbird-poki.zip` | 829 KB (1.72 MB html) | `pnpm verify:portals`, `pnpm audit:zips` |
| `sunbird-crazy.zip` | 820 KB | `pnpm verify:portals`, `pnpm audit:zips` |
| `sunbird-generic.zip` | 819 KB | `pnpm verify:portals`, `pnpm audit:zips` |
| `assets/submission/sunbird-thumbnail-1024.png` | 1150 KB · 1024×1024 | `pnpm verify:thumbnail` |
| `assets/submission/sunbird-thumbnail-628.png` | 445 KB · 628×628 (platform minimum) | `pnpm verify:thumbnail` |
| `assets/submission/art/sunbird-raw-1024.png` | master art (unmodified source of the graded deliverables) | — |

One command reproduces all of the above from a clean checkout:

```bash
pnpm poki:preflight    # build:portals → verify:portals → audit:zips → verify:thumbnail → poki:audit --run
```

### Thumbnail spec (Poki `06-thumbnail.md`)

- [x] 1024×1024 master, plus a 628×628 derivative at the platform minimum
- [x] Square, full-bleed, no transparency, no baked rounded corners / border / letterbox
- [x] No typography (nothing to lose at tile size)
- [x] Contrast survives the 128 px tile size (luminance spread 145 → 140)
- [x] Dominant colour 150 away from the Poki playground `#83FFE7` (needs ≥ 90)
- [ ] **Animated thumbnail** (3–5 s hover loop) — submission action, see below

### SDK integration

- [x] `gameLoadingStart()` → `gameLoadingFinished()` once each, in order
- [x] `gameplayStart()` on real play start, `gameplayStop()` on every halt, no consecutive duplicates
- [x] Pause → resume order: stop → `commercialBreak()` → start
- [x] `rewardedBreak()` on the continue screen only; one video per reward
- [x] `measure("run", mode, start→complete|fail)` funnel sound (never both outcomes)
- [x] Rewarded placement emits `visible` + `interact` with its offer context
- [x] Audio muted and input disabled for the whole break
- [x] Plays fine when the SDK never loads (sandbox / offline / rejected `init()`)

### Platform requirements

- [x] Scales to 640×360, 836×470, 1031×580 (e2e) plus phone portrait/landscape
- [x] Full canvas coverage, no letterbox, host page never scrolls
- [x] Incognito / blocked-storage safe (storage facade: localStorage → sessionStorage → memory)
- [x] Zero external requests; no service worker, no manifest in portal builds
- [x] No external links, no third-party ads, no IAP surface
- [x] Mobile-first: tablets get the mobile scheme; measured-lite devices drop shadows and the 2× buffer
- [x] Screen wake lock held exactly while flying (mobile)
- [x] Loading screen has a real progress bar driven by boot stages; background work deferred

### Content & safety

- [x] All-ages content; no chat (emotes only); no PII collection; identity is passive
- [x] **12 locales** (EFIGS + Turkish, CJK `zh-CN`/`ja`, `pt-BR`, Russian, Arabic RTL, Maltese), browser-language detection with a manual selector
- [x] Originality: procedural art, original characters, procedural score, no third-party assets
- [x] No AI watermarks or prompt text anywhere in the build

### Monetization

- [x] One rewarded placement (crash continue), context-driven framing, never blocking
- [x] Standard coin option **and** free option always rendered beside it, same size class above it
- [x] 🎬 on the rewarded button; warm-neutral styling, never green
- [x] Single currency; no dual economies; no ad timers in portal builds

## Submission steps (platform-side)

### Step 1 — Poki for Developers account

<https://app.poki.dev/signin>

### Step 2 — Upload the build and thumbnails

1. Open <https://inspector.poki.dev/>.
2. Choose the **unzipped folder** (unzip `sunbird-poki.zip`; `index.html` sits at the root).
3. Inspector auto-tests the build; walk the Event Log, External Resources, Image Optimization, Scaling and mobile (QR) modules.
4. In Poki for Developers: upload `sunbird-thumbnail-1024.png` (and the 628 px derivative if the form asks for the exact minimum).
5. Record and upload the **animated thumbnail** (3–5 s of gameplay) — see Step 5.

### Step 3 — Inspector QA review

- Expect **zero** external-resource and image-weight warnings (there are no raster assets in the game itself).
- Confirm the event log shows the documented sequences (loading → gameplay start/stop → break → resume).

### Step 4 — Final submission

Player-fit test → web-fit test → final review.

### Step 5 — Post-launch (optional)

- [ ] Animated thumbnail (hover video) for global release
- [ ] "Sign in with Poki" button on the profile screen (passive `getUser()` ships today; `login()` is deliberately not called at boot because it reloads the page)
- [ ] AUDS cross-device save once a live game id exists
- [ ] Netlib/server-approved multiplayer for the portal artifact

## Critical commitments at submission

1. **Web exclusivity** — `sunbird-poki.zip` is exclusive to Poki. The generic artifact (`sunbird-generic.zip`) is the non-exclusive build for itch.io / GameDistribution / etc.; keeping them separate artifacts is what makes the pledge honest.
2. **Animated thumbnail** — required for global release, not for initial approval.
3. **Multiplayer is single-player-first on the portal artifact** — the Rust room server stays out of the Poki zip.

## Files

| File | Purpose |
|---|---|
| `sunbird-poki.zip` / `sunbird-crazy.zip` / `sunbird-generic.zip` | Portal submissions (repo root, produced by `pnpm build:portals`) |
| `assets/submission/sunbird-thumbnail-*.png` | Static thumbnail deliverables |
| `assets/submission/art/sunbird-raw-1024.png` | Untouched master art |
| `docs/poki/` | Extracted guide + generated compliance report |
| `POKI_COMPLIANCE_AUDIT.md` | The earlier narrative audit (history; superseded by `docs/poki/COMPLIANCE.md` for status) |

## QA results (this session)

```
TypeScript:   ✅ PASS (0 errors)
Unit tests:   ✅ 1021 PASS (75 files)
Server tests: ✅ 7 PASS
Lint:         ✅ PASS (0 warnings)
Build:        ✅ PASS — 1.76 MB bundle, 557 KB gzipped
Portals:      ✅ PASS — poki 829 KB · crazy 820 KB · generic 819 KB
Zip audit:    ✅ BRUTAL AUDIT PASSED
Thumbnail:    ✅ THB GATE PASSED
Poki audit:   ✅ 99/113 verified, 0 failures (3 submission actions, 1 deferral, 10 informational)
```

**Next action:** unzip `sunbird-poki.zip` and run the Inspector pass at <https://inspector.poki.dev/>.
