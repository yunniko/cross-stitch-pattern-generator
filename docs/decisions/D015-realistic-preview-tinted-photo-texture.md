# D015 · The realistic preview tints the Owner's stitch photo per palette color
Date: 2026-09-09 · Goal: G-002 · Status: active (superseded by: —)
Context: The Owner supplied a real cross-stitch image and asked for it per stitch, tinted to the cell's color, keeping its shading and transparency.
Decision: Load public/stitch-texture.png once, downsample it to 64 px, and multiply each channel by that pixel's luminance while keeping alpha. Cache one tinted canvas per palette color.
Rejected: drawn crosses (D014, less realistic); tinting per cell (up to a million passes instead of at most one per color).
Consequence: The realistic renderer is asynchronous, and callers must ignore results superseded by a newer pattern or mode. The texture is the Owner's own drawing, so no license applies. D038 later made the background transparent.
Evidence: lib/export/stitch-texture.ts; public/stitch-texture.png; HANDOVER.md D15 as of commit f7bb51c.
