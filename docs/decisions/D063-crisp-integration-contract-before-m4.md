# D063 · Crisp pipeline integration follows a fixed contract, and Crisp refuses contour refinement
Date: 2026-09-12 · Goal: G-024 M4 planning · Status: active (superseded by: —)
Context: A second Codex critique of the M4 plan found the gradient known-gap fixture crossing a ramp reset, and transparent cells reported as confident boundaries.
Decision: Use a non-repeating ramp for the gap test, and give cells with no in-cell weight confidence 0. Integration: one frozen evidence layer, initialization by unary argmin against the returned palette, α derived from weights.color, protected cells keep their label on ties, validate-and-repair after merges, finalization by selected mode at weight α, and brand mapping after thread deduplication. Crisp with contourRefinement throws.
Rejected: raising the confidence threshold (noisy real ramps overlap the ideal 12/13 ceiling); coverage-wins initialization (picks costlier labels); pure mechanical merge remap (can leave inadmissible labels); threading Crisp through contour refinement (not adopted, D055).
Consequence: Every Crisp consumer must use the shared evaluator or reject the combination.
Evidence: tests/unit/crisp-edge-evidence.spec.ts; lib/crisp/crisp-evidence-layer.ts; HANDOVER.md D63 as of commit f7bb51c.
