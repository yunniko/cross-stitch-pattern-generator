# D274 · Texture strokes are the short ridges of textured areas, chosen by flow and spread
Date: 2026-10-02 · Goal: G-085 · Status: active (superseded by: —)
Context: an owl's hand-stitched feather and fur strokes are not lines of the picture; the Owner wants all kinds of picture, new threads, accent density.
Decision: strokes are the thin short ridges (D272) of 0.6 to 6 cells at the finest scales, weighted by how well they line up with their neighbours, chosen strongest first up to a quota per 8 x 8 block and a ceiling of 4,000, fitted to stitches of at most three cells, in at most four threads; the stitches under them are untouched.
Force: requirement — Owner, 2026-10-02: all kinds of picture, new threads, accent default. The stitches staying as they are is a tie-break (fewest changes). The quota, weights and thresholds are judgment.
Rejected: a gate on the kind of picture; random strokes (not tied to the picture's streaks); simplifying the stitches under dense strokes (more change, no gain asked).
Consequence: blotchy backgrounds get strokes too. A new threshold or a change of the ridge scale changes the strokes, not the stitches.
Evidence: docs/reviews/2026-10-02-texture-strokes.md; rust/cs-core/tests/texture_strokes.rs; tests/e2e/texture-strokes.spec.ts
