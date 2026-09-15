# D136 · Realistic view from per-colour stitch tiles; Grid + photo paints less overscan
Date: 2026-09-15 · Goal: G-036 M4 · Status: active (superseded by: —)
Context: after D135 the Realistic view still built a whole-chart preview (one `drawImage` per stitch, 2.6 s at 1000 stitches), and Grid + photo took 115–145 ms per frame drawing haloed symbols over a translucent photo.
Decision: each palette colour's tinted texture is rasterised once per tile size (at least 4 px, the preview's own floor), and a visible region is assembled from those tiles and drawn in one call, with older tiles drawn scaled while new ones build. Grid + photo paints a sixteenth of the view ahead on each side instead of a quarter. A floating selection's composite and the stitch count are cached per pattern.
Rejected: preview generation in a worker (the full-size canvas and its memory stay); haloed-symbol sprites (107 ms of `drawImage` against 82 ms of `strokeText`); drawing only the photo sub-rectangle under the view (little gain, and Original photo at 5 px exceeded D135's tolerance).
Consequence: the photo views stay within D135's tolerance; the PNG export keeps `renderStitchPreviewToCanvas`.
Evidence: tests/e2e/chart-viewport-parity.spec.ts; app/realistic-tiles.ts; GOALS.md G-036 progress log
