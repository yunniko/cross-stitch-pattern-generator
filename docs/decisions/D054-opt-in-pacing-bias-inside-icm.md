# D054 · Contour refinement is an opt-in pacing bias inside the single-cell ICM decision
Date: 2026-09-11 · Goal: G-022 M5.5 · Status: active (superseded by: —)
Context: The critique preferred multi-cell shared-boundary proposals, which didn't fit the milestone's remaining scope.
Decision: Add a pacingBias term to ICM's per-cell choice, off by default and run after cleanup and merge. Expected pace comes from a wider annulus of the same chain. Bias magnitude matches smoothness (0.045), scaled 1–2× by severity. Cells near junctions, above the importance threshold or on closed chains are never biased.
Rejected: full multi-cell proposals (scope, disclosed rather than hidden); an external source tangent (a photo has no known true curve); a wide window that includes the narrow one (dilutes the anomaly); bias proportional to raw excess (too small to change any cell).
Consequence: The pass can only reach better sequencing that single-cell moves allow. D055 measured it and kept it off.
Evidence: lib/experimental/contour-refinement.ts; tests/unit/contour-refinement.spec.ts; HANDOVER.md D54 as of commit f7bb51c.
