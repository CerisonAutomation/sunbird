# Sunbird completion checklist

## Audit and language
- [x] Confirm the correct repository and preserve the existing worktree.
- [x] Generate a complete locale barrel and packs for every supported locale.
- [x] Remove or route the audited home/menu/screen-title copy through the locale source of truth.
- [x] Extend the locale barrel across the progress route and verify the live Spanish route.
- [x] Verify no rendered text exposes raw template expressions or missing values.

## Gameplay and UX
- [x] Make PvP and PvAI opponent choice explicit and randomized-only for format/world.
- [x] Replace HUD ambiguity with explicit live-player, AI, ghost, and local labels.
- [x] Add safe share/challenge moments at results without interrupting active flight.
- [x] Verify readable HUD/menu behavior at desktop and narrow widths.

## Quality gates
- [x] Typecheck.
- [x] UI audit.
- [x] Targeted gameplay and locale tests.
- [x] Production build.
- [ ] Run the full test suite and resolve the remaining legacy contract failures.

## Completion
- [ ] ALL_TASKS_COMPLETE
