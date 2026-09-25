# Sunbird production gate

## Verified

- `pnpm typecheck` passes.
- `pnpm build:poki` passes and produces the single-file Poki artifact.
- `pnpm verify:upload` passes all ROOT-01 through ROOT-10 checks.
- Browser smoke confirms the redesigned home flow exposes Long Light, PvP, AI PvP, Shop, Squad, Settings, Challenges, progress, and Nest Pass without an overloaded first viewport.
- Targeted gameplay, funnel, ghost, analytics, and Poki SDK tests pass except the repository's legal-edition fixture suite and one SDK source-scanner false positive.

## Player-retention loop

The first session now has a clear sequence: fly immediately, see a daily course, compare against PvP/AI, earn the first reward, spend it in Hangar, then return for challenges and season progress. The menu keeps advanced destinations discoverable through intentional disclosures rather than hiding them or competing with the first action.

## Release blocker

The legal-edition fixture suite still expects the fuller upstream policy composition and rejects the current inherited CSP/payment fixture. Resolve that contract before declaring a final release. Do not bypass it with a test exclusion.
