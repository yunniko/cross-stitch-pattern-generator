# D175 · Crisp skips the two-mode fit where no two modes can be far enough apart
Date: 2026-09-19 · Goal: G-047 M4 · Status: active (superseded by: —)
Context: Crisp fits two colour modes to every cell's neighbourhood, and on photos 98–99 % of cells end with the modes closer than `minModeSeparation`, a single mode and zero confidence.
Decision: before the fit, the samples' OKLab bounding box is measured; when its squared diagonal is below `minModeSeparation` less a 1e-9 margin, the cell takes the single-mode result directly (`lib/crisp/crisp-edge-evidence.ts`).
Force: judgment — exact by construction (both modes lie inside the samples' box) and measured faster, 2000 Crisp 24.2 → 20.6 s alone.
Rejected: a heuristic pre-filter on importance or contrast, which D132 found loses confident cells; this bound loses none.
Consequence: any change to how modes are formed must keep them inside the samples' convex hull, or the bound stops being exact. The margin covers a weighted mean's rounding.
Evidence: tests/unit/crisp-separation-bound.spec.ts; tests/unit/crisp-evidence-equivalence.spec.ts; docs/reviews/2026-09-19-algorithm-review.md
