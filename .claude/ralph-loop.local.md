---
active: true
iteration: 4
max_iterations: 6
completion_promise: null
---

# Ralph Loop: Sunbird production cleanup + polish

## Objective
Iterate the codebase with rotating expert roles until the tree is junk-free,
fully gated-green, portal-shippable, and documented. Each iteration: critique
in-role → smallest coherent fix → programmatic gate.

## Completion Criteria
Complete when TODO.md shows [x] ALL_TASKS_COMPLETE

## Verification Commands (gate — every iteration ends here)
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build:portals && pnpm verify:portals`

## Roles (rotate, one lens per pass)
1. Portal Compliance Officer — Poki/CrazyGames rules vs src/sdk/platform.ts + Game wiring
2. Type-Safety Enforcer — no-explicit-any, strict tsc, no eslint-disable
3. Test Strategist — determinism, order-independence, no tautologies
4. Dead-Code Hunter — unused exports/files, orphan docs, stray artifacts
5. Docs Librarian — root .md sprawl, broken links, stale claims
6. Perf/Budget Guard — bundle/zip sizes, particle budgets, per-frame alloc

## Context
- Working tree has uncommitted prior work (feel, portal gate, CSS, tests) — build on it, don't revert.
- Simplicity rules: smallest coherent change at the owning layer; no speculative features.
- Never commit (user didn't ask). Leave scaffolding (.claude/ralph-loop.local.md, TODO.md) REMOVED when done.
