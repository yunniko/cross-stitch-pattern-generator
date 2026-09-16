# D144 · A Move drag paints the visible view only, at most once per animation frame
Date: 2026-09-16 · Goal: G-039 M2 · Status: active (superseded by: —)
Context: every stitch crossed during a Move repainted the view plus a quarter of it on each side, per pointer event: 50–97 ms per stitch at 1000 stitches with symbols (`docs/reviews/2026-09-16-move-tool-investigation.md`).
Decision: while a Move preview is active, `paint()` covers the visible rectangle with no overscan, and `previewMove` schedules one `requestAnimationFrame` paint that later positions replace; ending the drag cancels it and repaints with the usual overscan. Also: clear the bitmap rather than reassign an unchanged `canvas.width`/`height`; cache `opaqueCanvasRgb` per colour; reuse one `drawStitchPixels` scratch canvas and buffer per size; `shiftPattern` copies whole rows.
Rejected: coalescing every gesture (brush pixels are asserted per event, `tests/e2e/viewport-canvas.spec.ts`); dropping overscan outside drags (scrolling would repaint constantly).
Consequence: a scroll during a drag repaints instead of reusing overscan, and anything sampling preview pixels must wait a frame. Pixels are unchanged: parity draws through `drawSceneWithGesture`, not `paint()`.
Evidence: tests/e2e/chart-viewport-parity.spec.ts; tests/e2e/viewport-canvas.spec.ts; scripts/bench-move.spec.ts; GOALS.md G-039 progress log
