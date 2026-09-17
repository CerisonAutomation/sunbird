# Rebuild report — what applying the Poki guide changed

**Date:** 2026-09-17 · **Branch:** `arena/01a0b118-sunbird`
**Input:** the Poki developer guide, extracted into [`docs/poki/`](./README.md) (113 numbered rules, 72 of them hard requirements)
**Gate:** `pnpm poki:audit` → [`COMPLIANCE.md`](./COMPLIANCE.md) · `pnpm verify:thumbnail` · `pnpm verify:portals` · `pnpm test` (1021 tests)

This is the audit trail for the rebuild: every landed change, the rule it comes
from, and how it can be re-checked. Nothing here is "we believe"; each line has
a verifier.

## 1. The game already satisfied most of the guide — the gap was *provability*

The previous compliance pass (`../../POKI_COMPLIANCE_AUDIT.md`) had already fixed
the behavioural defects the rules care about (run-outcome funnel, rewarded
placement analytics, fake ad affordances, scaling sizes, coin faucets). What was
missing was that none of it was **executable**: the rules lived in a 30 KB
markdown audit and in the reviewer's memory. So the rebuild starts by making the
guide itself part of the repository.

| Change | Rule | Verifier |
|---|---|---|
| Extracted the whole guide into 10 numbered-rule documents + `requirements.json` (113 rules: 72 requirements, 31 recommendations, 10 informational) | — | `docs/poki/*.md`, `node scripts/poki-audit.mjs` |
| Added `scripts/poki-audit.mjs`: runs every rule's verification method, rewrites `COMPLIANCE.md`, exits non-zero on failure | — | `pnpm poki:audit` |
| Added `pnpm verify:thumbnail`, `pnpm render:thumbnail`, `pnpm poki:audit` | — | `package.json` |

Result: **98/113 rules machine-verified** (99 satisfied, 3 submission actions,
1 accepted deferral, 10 informational). The remaining 15 are listed by name in
`COMPLIANCE.md` §"Actions and accepted gaps" — never hidden, never assumed.

## 2. Engine decision, recorded (ENG-01…ENG-05)

The guide's engine page is a decision framework, not a menu. Applied to this
game it selects the branch the repository already took: **hand-rolled systems on
Three.js (MIT, 151 KB / 122 KB Brotli base) with a fully procedural asset
pipeline**, because `ENG-02` makes mobile web fit a *requirement* (initial
download < 5 MB, total < 8 MB) and every listed engine's empty build (290 KB –
11 MB) is a floor Sunbird cannot go under. The trade — owning physics,
animation, netcode and lifecycle — is documented in
[`01-web-game-engines.md`](./01-web-game-engines.md) §Part 4 and is what keeps
the Poki artifact near 700 KB.

No engine was swapped in. The deliverable is the *documented* decision plus a
gate that keeps it honest (`verify-portal.mjs` fails above 8 MB).

## 3. New code demanded by the extracted rules

### 3.1 `src/sdk/device-report.ts` — the Player Device Report as a probe (DEV-03…DEV-16)

The report lists what the platform measures: OS/browser, CPU cores, aspect
ratios, device pixel ratios, audio formats, WASM / WebRTC / WebP / WakeLock,
WebGPU + WebGL versions and extensions, and AI features (translator, language
model, summarizer, detector). `DEV-03` turns that into an obligation: *code to the
measured baseline.*

- One synchronous, side-effect-free, injectable probe covers **every** dimension
  the report publishes, including the one that was previously faked: WebGL
  capability was inferred from the UA and a `isMobile` heuristic.
- It derives a **quality tier** (`high` / `standard` / `lite`) from measurements,
  and the game reads that tier for shadows, pixel ratio and recovery.
- It reports one aggregate, identifier-free payload per session
  (`device_profile`), so our tiers can be compared against the platform's
  published distribution — and logs the same line in dev, which is how the
  tier behaviour stays visible during development.
- The AI probes are **detection only**: no AI-generated player-visible content
  ships (`REQ-34`), and the probes exist so a future localisation or moderation
  feature can be feature-detected instead of assumed.

Tests: `src/sdk/__tests__/device-report.test.ts` (17 cases, including a hostile
environment where every accessor throws — the probe must degrade, never throw).

### 3.2 `src/game/WakeLock.ts` — WakeLock where it actually matters (DEV-14)

WakeLock is on the report's list of essential APIs; for this game it has a
concrete job — a run is a long, low-interaction stretch, which is exactly when a
phone dims and suspends the tab mid-flight. The lock is:

- **feature-detected** (unsupported is a silent no-op — iOS Safari, older
  webviews, battery savers),
- **held exactly while flying** (driven from `Game.setState`, so menus, pause,
  sleep, results and ad breaks all release it),
- **re-acquired after a hide/show** (the platform drops the lock when the page
  hides, and the player is still in their run),
- **race-safe** (a lock that lands after the run ends is released immediately),
- **never noisy** (rejections are swallowed and routed to telemetry — portal QA
  treats console errors as defects, `REQ-02`).

Tests: `src/game/__tests__/wakelock.test.ts` (7 cases).

### 3.3 `src/game/BootProgress.ts` — a loading bar that is a measurement (EA-04, EA-05)

`EA-04` requires a visually engaging loading screen **with a progress bar**;
`EA-05` requires progressive loading, essential assets first. The repository
already had a good-looking inline boot screen — and the bar on it was an
indeterminate CSS slide that ran regardless of what the game was doing.

- Seven weighted stages (`shell → chunk → engine → world → hud → flight → ready`)
  are marked as the game actually reaches them; the inline bar switches from
  indeterminate to a real width, and stays honest on slow connections (it stalls
  where the work stalls).
- `ready` is terminal: it closes out every earlier stage, so the bar can never
  stall short of 100 %.
- `defer()` queues non-essential work on `requestIdleCallback` (with a timeout
  fallback) — the leaderboard warm-up and audio priming now load **after** the
  first interactive frame instead of blocking it.

Tests: `src/game/__tests__/boot-progress.test.ts` (9 cases).

### 3.4 `src/game/ContinueOffer.ts` — context-driven rewarded placement (MON-19)

`MON-19` asks for dynamic, context-specific rewarded opportunities instead of
static always-on buttons, while `MON-03…MON-15` fence the placement in. The new
module picks the *framing* from what the run just did — personal record,
near-best (with the exact gap), streak on the line, momentum — and falls back to
the neutral "Second Wind" card otherwise. Boundaries kept deliberately outside
the module:

- it cannot invent an ad: when the platform offers no rewarded break the kind is
  forced to `standard` and the copy contains no ad language (`MON-12`);
- it cannot become pushy: the standard coin option and the free "let it sleep"
  option keep the primary position and size (`MON-05…MON-08`, `MON-15`);
- it never grants anything — the single grant site is still `Game.doContinue()`
  (`MON-10`, `MON-11`).

Placement analytics now carry the context: `measure("button",
"continue-ad-<kind>", "visible"|"interact")`, so the platform dashboard can tell
which contexts convert (`REQ-14`).

Tests: `src/game/__tests__/continue-offer.test.ts` (9 cases).

## 4. Standards applied to shipped code

| Change | Rule | Verifier |
|---|---|---|
| Movement keys standardised: dive/hold now accepts **WASD and arrows** as well as Space (and still nothing is stolen from a focused control) | `EN-02` | `input-ui.test.ts` (+9 cases) |
| **Space/Return activate an overlay's primary action** even when focus sits on the dialog heading (the overlays move focus there for screen readers), without hijacking a control's own activation | `EN-02` | `overlay-navigation.test.ts` (+4 cases) |
| Locale set completed to the guide's phase order: **Turkish** (phase 1), **Russian** (phase 3) added — 12 locales × 44 strings | `LOC-04` | `i18n/__tests__/locales.test.ts` |
| Browser-language matching hardened: `pt`/`pt-PT` → `pt-BR`, `zh-Hant` → `zh-CN`, case/separator-insensitive, `navigator.languages` fallback list | `LOC-05` | `i18n/__tests__/locales.test.ts` |
| Barrel integrity: every shipped locale complete, every placeholder preserved, and every copy byte-identical — `src/` ⇄ `public/`, plus the generated upload folder when it exists | `LOC-02` | `i18n/__tests__/locales.test.ts` |
| Device tier now gates shadows and the 2× pixel-ratio path (a measured-lite device with a desktop UA no longer gets a buffer it cannot fill) | `DEV-03`, `ENG-02` | `device-report.test.ts`, existing perf guards |

## 5. Thumbnail rebuilt to the letter of the spec (THB-05…THB-10)

The gate measured the shipped art and failed it on one specific rule:

> **`THB-08`** — "High contrast is vital … avoid using colours similar to the
> Poki Playground background (`#83FFE7`)."

Measured: the thumbnail's bright cyan sky and spring-green islands put **30 % of
its pixels within 70 (RGB distance) of `#83FFE7`**, with the dominant colour
only 66 away. On the playground page it read as part of the background.

Changes:

| Change | Rule |
|---|---|
| `scripts/verify-thumbnail.mjs`: pure-Node PNG measurement gate — square, ≥ 628 px, full-bleed (no transparency), corners painted and not flat (no baked rounding/letterbox), luminance spread, distance from `#83FFE7`, contrast re-measured **at 128 px**, delivered weight | THB-05…THB-08, THB-10 |
| `scripts/render-thumbnail.mjs`: deterministic colour grade (smooth hue bands — sky rotated/deepened, foliage deepened and muted, bird/sun kept rich, near-neutral and near-white pixels untouched) applied to the raw master | THB-08 |
| Deliverables regenerated from the untouched master in `assets/submission/art/`: `sunbird-thumbnail-1024.png` (1505 KB → 1150 KB) and the new spec-minimum `sunbird-thumbnail-628.png` (445 KB) | THB-05, THB-10 |
| `scripts/png.mjs`: dependency-free PNG codec with adaptive row filtering and a box downscaler (the repo ships no native image dependency, and portal builds ship no raster assets at all) | THB-10 |

After the grade: **6.7 % of pixels** within 70 of the playground colour, dominant
colour distance **150**, luminance spread **145** (128 px: 140), corners painted.
Re-check with `pnpm verify:thumbnail`.

## 6. What the audit says is still open

`COMPLIANCE.md` currently lists:

| Rule | Status | Why |
|---|---|---|
| `EA-09` | action | Playtest recordings are a platform workflow; the build's funnel instrumentation is ready. |
| `THB-09` | action | The 3–5 s animated thumbnail (hover video) must be captured from a real session — not producible in this sandbox. The game is capture-ready. |
| `REQ-52` | action | Inspector QA walk (Event Log sequences, External Resources, Image Optimization, scaling tests, mobile QR) happens at submission on the unzipped folder. |
| `TOOL-08` | deferred | AUDS requires a live Poki game id and is platform-exclusive, so it cannot be a dependency of the portable builds. Leaderboard/ghost seams are shaped for it post-launch. |

## 7. Verification run for this report

| Gate | Result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm test` | **1021 passed** (75 files) — 72 new cases added by this rebuild (baseline: 949) |
| `pnpm test:server` | 7 passed |
| `pnpm lint` | clean (`--max-warnings 0`) |
| `pnpm build` | clean — 1.76 MB single-file portal bundle, 557 KB gzipped |
| `pnpm verify:prod` | PASS — debug artifacts clean (the device summary moved to the telemetry surface), 1.41 MB JS total of a 2.50 MB budget, largest chunk 0.57 MB of 1.50 MB, coverage floors met |
| `pnpm build:portals` + `pnpm verify:portals` | poki 829 KB · crazy 820 KB · generic 819 KB — gate PASSED |
| `pnpm audit:zips` | BRUTAL AUDIT PASSED (after reconciling the anatomy/pattern rules with the packaging script — see §8) |
| `pnpm poki:audit --run` | **99/113 verified**, 0 failures, `COMPLIANCE.md` rewritten, gates executed |
| `pnpm verify:thumbnail` | THB gate passed |

## 8. Two repository gates disagreed — reconciled

Running the extracted rules end to end surfaced a defect in the repository itself:
`scripts/audit-zips.mjs` (the deep portal-zip pass) and
`scripts/package-portal.mjs` (the packager) contradicted each other, so the deep
pass could never pass on a correct build. The audit claimed the artifact says
one thing while the packager shipped another:

| Finding | What was actually true | Fix |
|---|---|---|
| "unexpected zip entry `i18n/`" | The packager copies the locale barrel into every zip on purpose; the audit's allowed-anatomy list did not know about it (and it is consistent with the guide's external-resources policy: bundle, don't fetch). | Anatomy check now allows `index.html`, `icons/`, `fonts/`, `i18n/`. |
| "hardcoded WebSocket backend URL" | The match was `wss://netlib.poki.io/…` — the platform's own P2P signaling endpoint, recommended by the guide (`TOOL-04`), carried as a default by the vendor library. Our backend URL is correctly blanked in portal builds. | The pattern now bans every WebSocket URL **except** the Netlib signaling host. |
| "raw IP address" | The match was `127.0.0.1` inside the vendored WebRTC candidate filter (loopback candidates are dropped on purpose). | Loopback/private literals are allowed; **public** IP literals still fail. |
| "missing `gameLoadingFinished`" in the crazy/generic bundles | The Poki adapter is compiled out of those bundles by design — requiring a Poki signal in a CrazyGames build was the audit's bug. | SDK-specific required strings are now checked per portal (`poki` needs its loading/break signals, `crazy` its SDK loader, `generic` the local adapter). |

With the contradiction resolved, `pnpm audit:zips` is green and the corpus rules
that cite it (`TOOL-02`, `REQ-22`, `REQ-35`, `REQ-51`) are verifiable with
`pnpm poki:audit --run` instead of asserted by hand.

## 9. One more gate for CI-minded readers

`pnpm test:e2e` includes a new `e2e/input-standards.spec.ts` (arrow-key flight
that must not scroll the host page; Space activating an overlay's primary action
from the dialog heading). The browser download for Playwright is blocked in the
sandbox where this rebuild was produced, so those two specs were **not executed
here** — they are discovered by `pnpm test:e2e --list` and run in CI. Every other
gate in §7 ran locally.

## 10. "missing index.html" — the Inspector folder, and why it went stale

A real upload to <https://inspector.poki.dev/> was rejected with **"missing
index.html"**. The Inspector's own documentation states the shape it wants
(`08-game-dev-tools.md`, `TOOL-03`): *"If you are accessing the Poki Inspector
directly, open your game's **folder** to upload it"* and *"drag and drop your
game folder that contains an `index.html` file"* — a **folder**, with
`index.html` at the **root of the folder you select**.

The repository had two defects that could produce exactly that error, and one
that guaranteed the folder would rot:

| Defect | Evidence | Fix |
|---|---|---|
| The upload folder was a **hand-committed snapshot** (`poki-upload/` was tracked, 1.68 MB of pre-rebuild html) that no build refreshed. It was byte-different from `dist-poki/index.html` and had not moved through the latest rebuild. | byte compare against `dist-poki/index.html`; only the packaging step knew the current bytes | `poki-upload/` is now **generated on every `pnpm build:poki`**, byte-identical to the zip's `index.html`, git-ignored, and stamped with `upload-manifest.json` (source hash + staged hash + timestamp) |
| The build output itself was a trap: `dist-poki/` carried `sw.js` + `manifest.webmanifest` next to `index.html`, so a naive folder selection shipped PWA plumbing the portal forbids. | the packager stripped them from the zip only | the packager now **removes** them from `dist-poki/`, `dist-crazy/`, `dist-generic/`, so every folder in the tree is upload-shaped |
| Nothing verified the upload shape — the gates checked the *zip's* content, never "would the Inspector accept this folder". | no gate referenced the folder | new `scripts/verify-upload.mjs` → `pnpm verify:upload`, wired into `poki:preflight` and CI, and now the recorded verifier for `TOOL-03` |

`verify:upload` implements the Inspector's first checks as `ROOT-01`–`ROOT-06`:
root `index.html` in **both** the folder and the zip; no wrapping directory in
the zip; the folder proven **fresh** (packaging-manifest hash, `dist-poki`
source hash, and a byte-identical final 4 KB against `dist-poki/index.html`);
only uploadable files (no `sw.js`, manifest, sourcemaps or dotfiles); zip and
folder byte-identical; and every local reference in the shipped html resolving
inside the folder.

Each failure mode was **negative-tested** rather than assumed:

| Injected defect | Gate response |
|---|---|
| tail of `poki-upload/index.html` edited (a stale snapshot) | `ROOT-03` "was edited after packaging" + "does not carry the current build's code" → exit 1 |
| `index.html` renamed away (the reported error) | `ROOT-01` `index.html MISSING — the Inspector would say "missing index.html"` → exit 1 |
| zip re-created with a `sunbird-main/` wrapping directory (the GitHub "Download ZIP" shape) | `ROOT-02` "zip is wrapped in a directory: sunbird-main/" → exit 1 |

The runbook that replaces the old "unzip and hope" instruction is
[`UPLOAD.md`](./UPLOAD.md); `SUBMISSION_CHECKLIST.md` step 2 now says
`pnpm upload:poki` followed by dragging the generated `poki-upload/` folder.
