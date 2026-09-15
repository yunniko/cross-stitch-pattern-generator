# D139 · Crisp+ evidence also fits a blurred step, keeping Crisp's margin and threshold
Date: 2026-09-16 · Goal: G-038 M1 · Status: active (superseded by: —)
Context: Crisp's sharpness test compares a hard step with an affine ramp, so an edge blurred by a quarter of a cell falls back to averaged colours.
Decision: With `edgeModel: "blurred-step"` (Crisp+ only), each channel is also regressed on a logistic of 5 widths × 9 centre offsets over 48 projection bins; the more confident explanation wins, with plateau means as modes and coverage split at the fitted centre. Margin stays 0.75 and threshold 0.7.
Rejected: margins 1–1.5 (4,238–4,707 changed gradient cells, 1-cell lines erased); threshold 0.6 or 0.5 (1-cell lines lose 8 cells); extrapolated logistic endpoints as modes (can leave the sampled range).
Consequence: Crisp's default evidence is bit-identical; half-cell and wider blurs still need G-038 M2. A seam between two ramps is a real edge and may be confident.
Evidence: tests/unit/crisp-edge-evidence-blurred.spec.ts; tests/unit/crisp-plus-acceptance.spec.ts; tests/unit/crisp-plus-sweep.spec.ts; docs/reviews/2026-09-16-crisp-plus-calibration.md
