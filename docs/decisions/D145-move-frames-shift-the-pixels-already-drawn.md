# D145 · A Move frame shifts the pixels already drawn and patches the exposed strips
Date: 2026-09-16 · Goal: G-039 M3 · Status: active (superseded by: —)
Context: after D144 a Move step still redrew the whole view: 33–66 ms with symbols against a 16 ms target (`docs/reviews/2026-09-16-move-tool-investigation.md`). Both questions were left to the Company.
Decision: a Move frame copies the canvas onto itself by the stitches moved since the last frame and draws only the strips that exposes; a scroll, zoom, view or pattern change, or a shift past the canvas repaints in full. Grid lines keep travelling with the design, so a frame is a pure translation. Grid + photo may be copied: D135's "drawn clean" rule guards against accumulation over an uncleared canvas, which clean copies and strips avoid.
Rejected: pinning grid lines mid-drag (ends the pure translation, forcing a content/grid split and a new parity oracle, for a jump seen only on shifts off the 10-stitch grid); shifting with symmetry guides on (chart-fixed, they would travel with the copy).
Consequence: a drag with a symmetry axis on keeps D144's cost; the release repaints from the pattern.
Evidence: tests/e2e/viewport-canvas.spec.ts; scripts/bench-move.spec.ts; GOALS.md G-039 progress log
