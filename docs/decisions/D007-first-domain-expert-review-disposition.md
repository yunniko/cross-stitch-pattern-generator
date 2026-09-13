# D007 · First domain-expert review: fix the rendering and averaging bugs, defer chart conventions to M9a
Date: 2026-09-09 · Goal: G-001 M4 · Status: active (superseded by: —)
Context: A craft and color-science review of the first quantizer found bugs in the downsampling, rendering and symbols code.
Decision: Fix, as part of M5, empty cells rendering black, averaging in gamma-encoded sRGB instead of linear light, grid and font sizes not scaling with cell size, grey-flooded B&W cells, and confusable symbols. Move centre markers and row/column numbering into a new milestone.
Rejected: CIEDE2000 inside k-means (it isn't a metric, so Lloyd convergence breaks); claiming the 1/5/10 grid matches Aida markings (factually wrong; wording corrected).
Consequence: Averaging is always done in linear light. Symbols are ordered by visual weight to match the dark-to-light palette.
Evidence: docs/domain-reference.md; lib/pipeline/downsample.ts; HANDOVER.md D7 as of commit f7bb51c.
