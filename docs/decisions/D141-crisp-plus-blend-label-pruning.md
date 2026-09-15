# D141 · Crisp+ prunes thin mix colours whose cells ramp in the photo; freed slots stay free
Date: 2026-09-16 · Goal: G-038 M3 · Status: active (superseded by: —)
Context: After D140, blend palette entries remained at a one-cell blur (4 at 8 colours, 4 at 16).
Decision: After snapping, a colour with at most 20 % interior cells is pruned when its colour mixes two or three nearby distinct regions (residual ≤ 0.2) and no more than 25 % of its cells are flat inside (within-cell deviation < 0.1). Cells join their largest mixing constituent and count as its colour in the palette recompute.
Rejected: gradient threshold 0.06 (erased the 1-cell line, 17–249 gradient cells relabelled); 0.15 (prunes nothing); averaging the deviation over all cells (diagonal-line cells straddle an edge); reinvesting freed slots (would recreate the blends).
Consequence: At a one-cell blur, blends drop to 2 + 1 at 8 colours but only 28 + 29 at 16, where three-region mixes survive.
Evidence: lib/crisp/blend-label-pruning.ts; tests/unit/blend-label-pruning.spec.ts; tests/unit/crisp-plus-prune-sweep.spec.ts; docs/reviews/2026-09-16-crisp-plus-calibration.md
