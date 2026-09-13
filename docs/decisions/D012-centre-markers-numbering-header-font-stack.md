# D012 · Charts carry centre markers, row/column numbers, a size header and a pinned font stack
Date: 2026-09-09 · Goal: G-001 M9a · Status: active (superseded by: —)
Context: The first domain review named missing centre markers and edge numbering as the largest craft-usability gap at large stitch counts.
Decision: Draw inward arrows at each edge's midpoint, numbers at every 10-stitch gridline on the top and left, and a "w × h stitches, approx. size" header. Use an Arial, Segoe UI, sans-serif font stack. Show a live finished-size readout next to the size control.
Rejected: a bare sans-serif family (emoji-fallback risk for some symbols); gutters on every side (the legend's side already reserves that space).
Consequence: The right or bottom gutter is added only on the side opposite the legend.
Evidence: lib/export/render.ts; HANDOVER.md D12 as of commit f7bb51c.
