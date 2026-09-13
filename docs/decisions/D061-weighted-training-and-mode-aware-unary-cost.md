# D061 · Crisp palettes train on coverage-weighted modes; unary cost is α·fit + β·(1 − coverage)
Date: 2026-09-12 · Goal: G-024 M3 · Status: active (superseded by: —)
Context: A confident boundary cell has two colors, so palette training and label costs must stop treating each cell as one averaged color.
Decision: Weighted k-means takes per-mode samples weighted by coverage, weights both seeding draws, and reinvests cell-first by total weighted error. Unsupported labels on a confident cell cost Infinity. Two modes on one label keep the minimum cost. β = 0.15 is provisional. The RNG seed uses the distinct cell count.
Rejected: scoring labels against a blend of modes (manufactures the averaged color again); per-sample reinvestment ranking (blind to coverage); β = 0.08 (coverage nearly powerless against geometry); seeding from the raw sample count (splitting one cell reshuffles every seed).
Consequence: One weight-1 sample per cell reproduces the Standard quantizers byte-for-byte. Callers must not apply weights.color on top of α.
Evidence: lib/crisp/weighted-quantize.ts; lib/crisp/crisp-unary-cost.ts; tests/unit/crisp-unary-calibration.spec.ts; tests/unit/crisp-training-composition.spec.ts; HANDOVER.md D61 as of commit f7bb51c.
