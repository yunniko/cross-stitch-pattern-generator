# D136 · Realistic view from per-colour stitch tiles; Grid + photo symbols from sprites
Date: 2026-09-15 · Goal: G-036 M4 · Status: active (superseded by: —)
Context: after D135 the Realistic view still built a whole-chart preview (one `drawImage` per stitch, 2.6 s at 1000 stitches) and Grid + photo spent about 100 ms stroking and filling haloed symbols per visible stitch.
Decision: each palette colour's tinted texture is rasterised once per tile size (at least 4 px, as the preview's own floor), and a visible region is assembled from those tiles and drawn in one call; older tiles are drawn scaled while new ones build. Grid + photo blits per-cell-size symbol-and-halo sprites in the same order and position. A floating selection's composite and the stitch count are cached per pattern.
Rejected: moving preview generation to a worker (the full-size canvas and its memory stay); per-stitch sprites for plain symbols (D134 measured them slower than `fillText`).
Consequence: both views stay within the photo-view tolerance of D135; the PNG export keeps `renderStitchPreviewToCanvas` and text glyphs.
Evidence: tests/e2e/chart-viewport-parity.spec.ts; app/realistic-tiles.ts; GOALS.md G-036 progress log
