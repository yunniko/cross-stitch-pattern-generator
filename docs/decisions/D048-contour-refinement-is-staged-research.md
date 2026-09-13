# D048 · Contour refinement is a staged research effort with admissibility constraints
Date: 2026-09-11 · Goal: G-022 M5 · Status: active (superseded by: —)
Context: M5 (smoother stair-step contours) was the highest-risk, most open-ended milestone, so its design went to a Codex critique first.
Decision: Split M5 into M5.1–M5.6. Build a calibrated step-discrepancy pacing metric, close the harness gaps, extract boundary chains, and rank hand-made candidates with known then estimated tangents. Only then build multi-cell shared-boundary moves, freezing corners, thin features and junctions, and sweep broadly before adopting parameters.
Rejected: one undifferentiated milestone; a higher-order ICM term alone (single-cell moves still can't cross the barrier); continuous contours then rasterizing (reversals and conflicts); curvature penalties on stitch edges (every staircase is right angles).
Consequence: The pass runs after structural cleanup and merge, before palette recompute, with no cleanup after it. D055 concluded it doesn't survive broad testing.
Evidence: tests/unit/contour-pacing.ts; lib/experimental/boundary-chains.ts; HANDOVER.md D48 as of commit f7bb51c.
