# D038 · The realistic preview has a transparent background and no border
Date: 2026-09-11 · Goal: G-019 · Status: active (superseded by: —)
Context: The Owner asked for a transparent background instead of 50 % gray, and no frame.
Decision: Never fill the preview canvas, and size it exactly width × cellSize by height × cellSize, for both the on-screen view and the PNG download.
Rejected: keeping a fill color (hides the texture's real alpha edges and empty cells).
Consequence: Empty cells read back as fully transparent pixels. Deployed 2026-09-11 and checked on production by decoding the downloaded PNG.
Evidence: lib/export/render.ts; lib/export/stitch-texture.ts; HANDOVER.md D38 as of commit f7bb51c.
