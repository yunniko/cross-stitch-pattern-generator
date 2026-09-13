# D096 · Crisp acceptance covers every report fixture, measured at real downsampling ratios
Date: 2026-09-12 · Goal: G-024 M6 · Status: active (superseded by: —)
Context: The final Crisp milestone needed the report's full twelve-row acceptance matrix, benchmarks and a delivery write-up.
Decision: Close the remaining rows in a dedicated acceptance spec. Shape rows use a 4:1 downsample, and bridge checks use endpoint separation²/8 as a self-calibrating threshold. Each check is confirmed to fail on Standard first.
Rejected: 1:1 shape fixtures (Standard and Crisp gave identical palettes, a vacuous comparison); a fixed 0.02 bridge epsilon (false failure on the close equal-luminance pair).
Consequence: Crisp measured about 45–56 % slower than Standard. Thin lines, junctions and shading fall back to Standard. On this Windows host, stopping a background task may leave its node process running, so check the process is gone.
Evidence: docs/reviews/2026-09-12-crisp-edges-acceptance-and-delivery.md; tests/unit/crisp-edges-acceptance-matrix.spec.ts; tests/unit/crisp-benchmark.ts; HANDOVER.md D96 as of commit f7bb51c.
