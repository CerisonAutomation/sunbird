---
active: true
iteration: 0
max_iterations: 10
completion_promise: null
---

# Sunbird: polish / critique / fix / upgrade, x10 passes, Poki-canonical

## Objective
Take Sunbird from "shipped and compliant" to genuinely excellent on the three
axes the user named — VISUAL, FUNCTIONAL, PERFORMANCE — with Poki's requirements
as the constraint, and prove each pass improved something rather than churned.

## Loop (one pass = four steps, in this order)
1. VERDICT — render the shipping build at Poki's sizes (640x360, 836x470,
   1031x580) plus mobile, LOOK at the screenshots, and score: hierarchy,
   legibility, contrast, spacing, states, copy. Record the score and the
   specific defects. No pass without a rendered image I have looked at.
2. FIX — take the highest-severity defects from the verdict and fix them.
   Anything touching a spec's exact string is a paired change (see
   copy-surface-and-spec-coupling).
3. VERIFY — `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build:poki`,
   `pnpm verify:upload`, and re-render the screen I changed and look again.
4. RECORD — update TODO.md with what changed and the new score.

## Completion criteria
Complete when TODO.md shows [x] ALL_TASKS_COMPLETE, which requires:
- every P0 and P1 finding from the critique pass is fixed and re-verified
- the visual pass shows no unaddressed legibility/contrast/overlap defect
- no pass ended with a LOWER score than it started

## Verification commands
- pnpm lint && pnpm typecheck && pnpm test
- pnpm build:poki && pnpm verify:upload
- node scripts/serve-upload.mjs   (serves poki-upload/ at :4174 for rendering)

## Context
- Poki rules that constrain every decision: docs/poki/requirements.json
  (onboarding, 44px targets, no green rewarded buttons (MON-08), ad labelling,
  no chat, mobile-first), and docs/poki/COMPLIANCE.md for current status.
- The two independent critique assessments are running; their findings are the
  first pass's input.
- Do NOT report or optimise fps: Chromium here is SwiftShader on a loaded
  machine, so frame timing is an artifact of the harness, not the game.
