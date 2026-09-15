# D134 · The on-screen chart fills small stitches and the highlight mask from scaled pixels
Date: 2026-09-15 · Goal: G-036 M2 · Status: active (superseded by: —)
Context: below the 6 px symbol floor, `drawChart` issued one `fillRect` per stitch, blocking the page for about 0.4–0.6 s when a 1000-stitch chart was shown or reopened; the highlight overlay did the same at every size.
Decision: on screen only, `drawChartOnScreen` writes one pixel per stitch and scales it with nearest-neighbour `drawImage` below the symbol floor when the empty-stitch colour is opaque, and `drawHighlightOverlayRaster` composites the dimming mask the same way at every size; otherwise, and for every export, `drawChart` and `drawHighlightOverlay` run unchanged.
Rejected: changing the export path (the shared `ChartDrawingContext` also drives vector PDF drawing); sprites blitted per stitch (pixel-identical but slower than `fillText`).
Consequence: on-screen drawing must stay byte-identical to the frozen pre-G-036 renderer; a drawing change updates the reference only through a new decision.
Evidence: tests/e2e/chart-render-parity.spec.ts; tests/unit/reference/render-pre-g036.ts; GOALS.md G-036 progress log
