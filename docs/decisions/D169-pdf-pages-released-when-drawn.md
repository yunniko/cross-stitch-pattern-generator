# D169 · Each Pattern Keeper page is released as soon as it is drawn
Date: 2026-09-19 · Goal: G-046 M2 · Status: active (superseded by: —)
Context: pdf-lib keeps every page's operators as objects until `save()`. A stitch costs about eleven — three for its fill, eight for the symbol Pattern Keeper needs as real text in every cell — so the PDF needed 1.68 GB at 1000 stitches against a worker's 1048 MB heap (D155).
Decision: once a page is drawn, its content stream becomes the deflated stream `save()` would have written, at the same object number, and its operators are let go (`lib/export/pdf-page-flush.ts`).
Force: requirement — G-046's criterion of a bounded worker heap, and the PDF failing at today's own cap.
Rejected: batching same-colour fills, D155's named fix, which trims the three fill operators but not the eight per symbol; a larger heap, which D155 found only delays the failure.
Consequence: the file is byte-identical, and the heap stayed at 40–66 MB from 1000 to 2000 stitches under a 512 MB limit. It relies on two private pdf-lib 1.17.1 fields, pinned by a test.
Evidence: tests/unit/pdf-page-flush.spec.ts; docs/reviews/2026-09-18-larger-canvas-walls.md; GOALS.md, G-046 progress log, 2026-09-19
