# D178 · The denoise computes each pair once, and luminance is computed once
Date: 2026-09-19 · Goal: G-047 M5 · Status: active (superseded by: —)
Context: the 3×3 medoid denoise computed all 81 pairwise distances of each window, and the edge map and cell importance each converted every source pixel to luminance through a fresh tuple.
Decision: the denoise computes the 36 distinct pairs once and sums each row in the original order; `sourceLuminance` computes every pixel's luminance once, as bytes, for both consumers.
Force: judgment — both exact (squared distance is the same double both ways; luminance is an integer 0–255, checked for all 2^24 colours) and measured faster.
Rejected: releasing pair evidence's unblurred planes early, measured with no effect on peak memory (423 → 422 MB), so not kept.
Consequence: the shared luminance holds 12 MB at the 12 MP decode cap through both passes (true peak 411 → 422 MB there).
Evidence: tests/unit/denoise-symmetric.spec.ts; tests/unit/source-luminance.spec.ts; tests/unit/golden-hashes.spec.ts
