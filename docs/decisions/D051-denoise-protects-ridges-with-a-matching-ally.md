# D051 · Denoise protects a cell with high ridge strength and a matching neighbor
Date: 2026-09-11 · Goal: G-022 M5.2 follow-up · Status: active (superseded by: —)
Context: D050 showed the medoid pre-filter erasing thin real features that importance can't see.
Decision: Protect a below-importance cell when its ridge strength is high and it has a same-colored neighbor. Ridge strength is the maximum, over four grid directions, of the squared OKLab distance from the cell to the midpoint of its opposite neighbors.
Rejected: protecting any cell with a near-duplicate neighbor under an absolute tolerance (close-color diagonal IoU fell 0.79 to 0.65); a relative closest-neighbor search (an extreme-value statistic, so noise looks like lines).
Consequence: Real ridges score about 18× the worst noisy-region value. Isolated single-cell outliers are still filtered. The axial-line test requires more than 90 % survival.
Evidence: lib/pipeline/denoise.ts; tests/unit/denoise.spec.ts; tests/unit/shape-fixtures-m5.2.spec.ts; HANDOVER.md D51 as of commit f7bb51c.
