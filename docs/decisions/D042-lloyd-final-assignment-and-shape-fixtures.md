# D042 · Lloyd's last step reassigns against the returned centroids; a shape-fidelity suite guards boundaries
Date: 2026-09-11 · Goal: G-022 M1 · Status: active (superseded by: —)
Context: The cluster-boundary review found runLloyd returning assignments made against the previous iteration's centroids (40–56 of 3,600 cells on a soft circle).
Decision: After the loop, assign every cell once more to its nearest final centroid. Add a reusable shape harness (soft-gradient SDF sources, IoU, symmetric boundary distances) with circle, ellipse, S-curve, diagonal-stroke and rectangle fixtures.
Rejected: measuring the invariant after RGB rounding (rounding alone moves some nearest matches); shape-specific metrics (one general harness covers every fixture).
Consequence: Tests assert exact nearest-centroid equality on float centroids. IoU dilutes local artifacts, so shape tests also check maximum boundary distance and use moderate gray contrast.
Evidence: lib/pipeline/quantize.ts; tests/unit/shape-fixtures.ts; tests/unit/shape-regression.spec.ts; docs/reviews/2026-09-11-cluster-boundary-review.md; HANDOVER.md D42 as of commit f7bb51c.
