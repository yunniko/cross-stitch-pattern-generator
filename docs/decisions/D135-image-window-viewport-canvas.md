# D135 · The Image window paints a viewport canvas inside a chart-sized frame
Date: 2026-09-15 · Goal: G-036 M3 · Status: active (superseded by: —)
Context: one chart-sized canvas (up to 8000 × 6000) was redrawn whole on every zoom, view switch, highlight and select, blocking the page for 1.3–2.5 s at 1000 stitches.
Decision: a chart-sized frame takes layout, input and the zoom anchor in content-box coordinates. One canvas inside paints the visible rectangle plus a quarter view per side, at whole chart pixels, from the scene and the active gesture; the anchor is applied before measuring. On screen, grid lines are filled rectangles, Grid + photo drag previews are drawn clean, and a mid-drag zoom redraws the preview (Owner, 2026-09-15).
Rejected: stroked grid lines (their anti-aliasing varies with canvas size); `position: sticky` (shows stale pixels); a full-size offscreen canvas (keeps the memory).
Consequence: supersedes D121's full-size canvas and D104's whole-canvas snapshots. On-screen parity is the frozen drawing with rectangle grid lines; scaled photo pixels may differ by 16 levels, selection outlines by 1. Border clicks no longer paint edge stitches.
Evidence: tests/e2e/chart-viewport-parity.spec.ts; tests/unit/chart-viewport.spec.ts; GOALS.md G-036 progress log
