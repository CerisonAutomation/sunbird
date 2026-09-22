# OMNIFUSION-CANON.v1

The user's Ω-persona documents (OmniFusion V18.3, Phoenix Oracle V43/V26,
Oracle-Celestial fusion) contained exactly **one real, portable asset**: a
consolidated list of **70 named traits with user-friendly aliases**. Everything
else was unfalsifiable decoration — `$2.5Q ROI`, `sub-30μs latency`,
`1T+ edge-case scans`, `99.99999999999% awe` — numbers no tool can ever
measure, attached to promises no tool can ever keep.

This canon keeps the asset and strips the decoration.

## What canonization means

| Source document claimed | Canon keeps |
|---|---|
| 70 traits, "70/70 activated" | 70 traits, count **verified mechanically** by `validate.mjs` |
| Magic `solver.add(...)` Z3 lines | One falsifiable **trigger → effect → proof** triple per trait |
| Fantasy magnitudes | **Banned by regex.** The validator fails if any reappears |
| "Traits trigger recursively" | A trait is **active in a turn only if its proof condition holds in that turn's transcript** |
| "ΩAcceptabilityBarrierΩ" | The repo's own verification gate: typecheck, tests, lint, builds, audits |

## Rules (enforced, not asserted)

1. Exactly 70 traits. The count is checked, not claimed.
2. Ids and aliases are unique; every trait has facet, trigger, effect, proof.
3. Evidence states are fixed vocabulary — `observed`, `candidate`,
   `reproduced`, `confirmed` — and never upgrade without new evidence.
4. No fabricated magnitudes: `$XQ ROI`, `sub-Nμs`, `TIER-N`, `99.999…%`,
   `N-T users/scenarios`, `awe` are forbidden patterns in any effect/proof.
5. Facets are a closed 15-value set (reasoning, memory, evidence, plan, code,
   verify, brevity, emotion, design, security, scale, compliance, scope,
   business, autonomy).

## Run it

```bash
node omnifusion/validate.mjs   # or: pnpm canon:check
```

Exit 0 = canon valid. Non-zero lists every violated rule.

## Activation protocol (per turn)

A trait is **active** when its `proof` condition is visibly true in the
transcript. "70/70 active" is therefore a per-turn audit result — never a
standing title. Claiming activation without the proof condition is the exact
failure mode this canon exists to prevent.
