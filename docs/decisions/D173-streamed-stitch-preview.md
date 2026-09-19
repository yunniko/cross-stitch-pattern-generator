# D173 · The realistic preview PNG is streamed from per-colour tiles
Date: 2026-09-19 · Goal: G-047 M2 · Status: active (superseded by: —)
Context: the preview was drawn onto one canvas the size of the whole image, 12 000 px on its longer side above about 500 stitches: 384 MB at 1000 stitches and 1993 MB of RSS at 2000, the largest allocation in the app (G-046 M1).
Decision: each colour's texture is scaled into a stitch-sized tile once (`buildStitchTiles`, shared with the Image window), and the strips of rows the PNG encoder asks for are copied together from those tiles, so the image never exists whole.
Force: requirement — the processor's 2 GiB container, which the old preview alone nearly filled at 2000 stitches.
Rejected: lowering the preview's resolution to the chart PNG's 40 Mpx cap (a visible change nobody asked for, and streaming makes it unnecessary).
Consequence: the pixels differ from the old canvas drawing by at most 1 in a few texels per stitch, within the Owner's ±1. Resolution is unchanged.
Evidence: tests/unit/stitch-preview-stream.spec.ts; GOALS.md, G-047 progress log, 2026-09-19
