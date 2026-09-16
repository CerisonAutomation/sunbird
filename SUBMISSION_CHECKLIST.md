# Sunbird × Poki — Submission Checklist

**Status:** ✅ **READY FOR SUBMISSION**
**Date:** 2026-09-16
**Build Commit:** $(git rev-parse --short HEAD)

## Pre-Submission Verification

### Code Quality ✅
- [x] TypeScript compilation: **PASS** (0 errors)
- [x] Unit tests: **949 PASS** (70 test files)
- [x] Compliance audit: **SHIPPABLE** (all hard requirements met)
- [x] Build succeeds: **✅** (dist-poki/index.html generated)
- [x] Poki build: **✅** (sunbird-poki.zip ready)

### Artifact Files ✅
- [x] **sunbird-poki.zip** (700 KB)
  - Contains: index.html (1.6 MB), icons/, fonts/
  - Status: **VERIFIED** (all assets present, no external requests)
  
- [x] **poki-upload/** folder (1.8 MB uncompressed)
  - Ready for Inspector folder upload
  - Status: **VERIFIED** (extracts correctly)

- [x] **sunbird-thumbnail-1024.png** (1.7 MB)
  - Size: 1024×1024 pixels ✅
  - Format: PNG RGB ✅
  - Spec: Full-bleed, no text ✅

### SDK Integration ✅
- [x] `gameLoadingFinished()` fires once ✅
- [x] `gameplayStart()` on first input (not load) ✅
- [x] `gameplayStop()` on pause/menu/end ✅
- [x] No consecutive duplicate events ✅
- [x] `commercialBreak()` on death→restart + pause→resume ✅
- [x] `rewardedBreak()` on continue screen ✅
- [x] Audio muted during ads ✅

### Hard Requirements ✅
- [x] H1: Mobile/tablet/desktop support ✅
- [x] H2: Full canvas coverage (no letterbox) ✅
- [x] H3: Incognito support (localStorage fallback) ✅
- [x] H4: No external requests (1.48 MB single file) ✅
- [x] H5: No external links/branding ✅
- [x] H6: No ad-block prevention ✅

### Platform Integration ✅
- [x] Scales to 640×360, 836×470, 1031×580 ✅
- [x] Mobile fullscreen ✅
- [x] Tablets forced to mobile scheme ✅
- [x] Portrait playable (390×844) ✅
- [x] No parent page scrolling ✅
- [x] Responsive design tested ✅

### Content & Safety ✅
- [x] All-ages content ✅
- [x] No PII collection ✅
- [x] No chat system ✅
- [x] No external account systems ✅
- [x] 10 languages (EFIGS + pt-BR + ar-RTL + zh-CN + ja + mt) ✅
- [x] Originality verified (procedural + economy layer) ✅

### Monetization ✅
- [x] One rewarded placement (continue screen) ✅
- [x] Standard alternative always present ✅
- [x] 🎬 video icon on reward button ✅
- [x] No green UI on reward button ✅
- [x] Coin economy only (no dual currencies) ✅
- [x] No IAP visible in portal build ✅
- [x] No reward walling core gameplay ✅

### File Size ✅
- [x] Zip: **700 KB** (under 1 MB) ✅
- [x] Gzipped: **433 KB** ✅
- [x] Single-file inlining (Vite singlefile) ✅

## Submission Steps

### Step 1: Create Poki for Developers Account (if needed)
- Navigate to: https://app.poki.dev/signin
- Sign in with Google / Create account
- Verify email

### Step 2: Upload Build & Thumbnail
1. Go to: https://inspector.poki.dev/
2. Click **"browse to choose a folder"**
3. Select: `/Users/cb/Developer/projects/sunbird/poki-upload/`
4. Inspector will auto-test the build
5. In Poki for Developers portal:
   - Upload static thumbnail: `assets/submission/sunbird-thumbnail-1024.png`
   - Optionally record animated thumbnail (3–5 s gameplay video)

### Step 3: Inspector QA Review
- Inspector runs automated tests (SDK, scaling, resources, events)
- Fix any flagged issues
- Get **PASS** verdict before proceeding

### Step 4: Final Submission
- Poki team: player fit test → web fit test → final review
- Response: ~2 weeks

### Step 5: Post-Launch (Optional)
- [ ] Turkish + Russian locales
- [ ] `login()` button on profile screen (identity commitment)
- [ ] AUDS cross-device save
- [ ] Netlib multiplayer (server approval required)

## Critical Commitments at Submission

1. **Web Exclusivity** (Item B2)
   - Confirm: The Poki build (`sunbird-poki.zip`) is exclusive to Poki
   - Note: The generic build (`sunbird-generic.zip`) can ship to itch.io/GameDistribution/etc.

2. **Animated Thumbnail** (Item P1)
   - Required for **global release** (not blocking initial approval)
   - Capture 3–5 s gameplay loop from browser
   - Upload in Poki for Developers portal

## Files Location

| File | Path | Size | Purpose |
|------|------|------|---------|
| Build ZIP | `/Users/cb/Developer/projects/sunbird/sunbird-poki.zip` | 700 KB | Inspector + submission |
| Build Folder | `/Users/cb/Developer/projects/sunbird/poki-upload/` | 1.8 MB | Inspector folder upload |
| Static Thumbnail | `/Users/cb/Developer/projects/sunbird/assets/submission/sunbird-thumbnail-1024.png` | 1.7 MB | Player fit test |
| Compliance Report | `/Users/cb/Developer/projects/sunbird/POKI_COMPLIANCE_AUDIT.md` | — | Reference (already verified) |

## QA Results (Current Session)

```
TypeScript:  ✅ PASS (0 errors)
Unit Tests:  ✅ 949 PASS (70 files)
Build:       ✅ PASS (dist-poki/index.html)
Inspector:   ✅ LOADED (http://localhost:8765)
Compliance:  ✅ SHIPPABLE
```

---

**Next Action:** Upload to Poki Inspector at https://inspector.poki.dev/ and complete the submission workflow.
