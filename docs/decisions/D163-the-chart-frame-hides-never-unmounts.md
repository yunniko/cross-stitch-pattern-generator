# D163 · The chart frame hides; it is never unmounted
Date: 2026-09-18 · Goal: G-045 · Status: active (superseded by: —)
Context: the start screen covers an open chart. Gating the frame on a condition unmounted it, and Back then showed a correct-looking chart with a blank canvas — shipped once, in 44937a9.
Decision: the frame stays mounted and takes `hidden` instead. Anything that hides the chart hides this element; nothing removes it while a pattern exists.
Rejected: unmounting and forcing a repaint on remount, which adds a second redraw path for one screen; remounting and hoping the effect re-runs, which it cannot — the redraw is a layout effect keyed on the pattern and the scene, and neither changes while the start screen is up.
Consequence: a remount would lose the painted pixels, the renderer's refs, the ResizeObserver, and `data-painted-rect`, which `tests/e2e/viewport-canvas.spec.ts` and `tests/e2e/symmetry.spec.ts` read. A test that asserts only presence or `data-cell-size` cannot tell a drawn chart from a blank one, so the Back case reads pixels.
Evidence: tests/e2e/new-chart.spec.ts; app/components/image-window.tsx; app/hooks/use-chart-renderer.ts
