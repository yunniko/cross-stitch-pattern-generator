# D026 · Code-review fixes: whole-chart pixel budget, area-weighted downsampling, OKLab palette centroids
Date: 2026-09-10 · Goal: G-010 M2–M6 · Status: active (superseded by: —)
Context: The 2026-09-09 review's findings 2–8 covered allocation risk, header clipping, resampling bias, an inconsistent palette objective and silent failures.
Decision: findChartLayout fits the whole chart within 40 M px and 8,000 px per side, or throws ChartTooLargeError. Image decode caps at 4,000 px. Downsampling is destination-driven area-weighted averaging. Palette colors are OKLab means, matching the assignment metric. Texture loads can retry, a null toBlob rejects, and custom sizes must be integers.
Rejected: bounding only the stitch grid (D004's clamp missed the legend and header); documenting linear-RGB centroids as a trade-off (contradicts D006/D007).
Consequence: Spatial downsampling still averages in linear light; only palette centroids use OKLab. The layout search starts at its minimum cell size.
Evidence: docs/reviews/2026-09-09-code-review.md; lib/export/render.ts; lib/pipeline/downsample.ts; tests/unit/chart-layout.spec.ts; HANDOVER.md D26 as of commit f7bb51c.
