# D058 · Crisp boundary evidence fits two modes per cell; confidence is color separation times spatial separation
Date: 2026-09-11 · Goal: G-024 M2 · Status: partly superseded (superseded by: D059, D064)
Context: Crisp mode needs to know when a cell straddles a genuine two-color hard boundary.
Decision: Fit a weighted two-means on an expanded neighborhood (margin 0.75) using downsampling's coverage weights, seeded by farthest point, with up to 6 Lloyd iterations. Confidence = separation/(separation + max spread) × min(1, spatial separation/0.5). Centroids closer than 0.02 give one mode and confidence 0.
Rejected: random seeding (run-to-run flakiness); a single combined score (can't separate noisy-but-split from interleaved texture).
Consequence: Checkerboards are rejected by the spatial factor. D059 found gentle gradients rejected only by the separation gate, and steeper ramps scoring as edges.
Evidence: lib/crisp/crisp-edge-evidence.ts; tests/unit/crisp-edge-evidence.spec.ts; HANDOVER.md D58 as of commit f7bb51c.
