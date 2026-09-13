# D049 · The shape harness measures N classes, degenerate boundaries, fractional scales, junctions and thin lines
Date: 2026-09-11 · Goal: G-022 M5.2 · Status: active (superseded by: —)
Context: The M5 critique named harness gaps that hide real damage: two-class masks, empty boundaries scoring perfectly, 1:1 sampling only, and a half-pixel coordinate mismatch.
Decision: Add multi-class agreement, a degenerate flag on boundary distances, scale-decoupled measurement, cell-centered source builders and a four-quadrant junction fixture checking local cyclic adjacency. Leave existing builders and thresholds unchanged.
Rejected: fixing the old builder's half-pixel convention in place (would churn every tuned threshold); whole-image IoU or global adjacency for junctions (both miss a real junction split).
Consequence: The thin-line fixture found the deployed pipeline erasing one-cell axial lines completely while diagonal lines survived (diagnosed in D050, fixed in D051).
Evidence: tests/unit/shape-fixtures.ts; tests/unit/shape-fixtures-m5.2.spec.ts; HANDOVER.md D49 as of commit f7bb51c.
