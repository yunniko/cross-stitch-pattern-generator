# lib/experimental

Modules that are not part of the default generation pipeline. Nothing in the
app imports them, except `buildPattern`'s opt-in `contourRefinement` option.
They are kept because their tests document real findings, not because
anything ships them. Delete a module here once its decision record says it is
abandoned; git keeps the history.

| Module | Status | Used by |
|---|---|---|
| `contour-refinement.ts` | Opt-in pacing pass (G-022 M5.5, D48/D53/D55). Off by default; rejects Crisp mode. Not enabled until a broad fixture sweep justifies it. | `buildPattern({ contourRefinement: true })`, tests |
| `boundary-chains.ts` | Boundary-chain extraction backing `contour-refinement.ts`. | `contour-refinement.ts`, tests |
| `simulated-annealing.ts` | Optional boundary-only annealing pass; never adopted into the default pipeline (D9). | tests only |
| `diagnostics.ts` | Pattern quality metrics (confetti ratio, compactness, reconstruction error, edge alignment) for regression suites. | tests only |
