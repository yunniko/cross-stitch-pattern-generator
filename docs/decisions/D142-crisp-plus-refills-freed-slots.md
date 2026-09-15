# D142 · Crisp+ refills only the slots it frees, splitting interior cells, never into a blend
Date: 2026-09-16 · Goal: G-038 M5 · Status: active (superseded by: —)
Context: Snapping and pruning empty palette colours, so real photos ended under the requested count (road-mountains 14 of 24).
Decision: After those passes, split the colour whose cells carry the largest squared error until the freed slots are filled. A split learns only from cells well inside their own colour: cells the passes moved, their neighbours, and any cell beside a different colour are held out. A split is refused when either new colour lies between two palette colours (within 25 % of their distance, at 0.1–0.9 along it), which is what a blend looks like.
Rejected: refilling up to the requested count (gradients gained colours Crisp never gave them); letting moved cells choose a half (rebuilt the blends: blur 0.5 went from 0 to 41 blend cells); re-running colour selection on the cleaned chart (about 3.3 s at 1000 stitches).
Consequence: A chart whose colours all survive is untouched; freed slots are filled only where interior detail justifies it.
Evidence: lib/crisp/palette-refill.ts; tests/unit/palette-refill.spec.ts; tests/unit/crisp-plus-acceptance.spec.ts; docs/reviews/2026-09-16-crisp-plus-calibration.md
