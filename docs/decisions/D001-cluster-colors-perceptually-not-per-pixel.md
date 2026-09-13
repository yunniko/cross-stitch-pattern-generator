# D001 · Colors are reduced by clustering cell averages in a perceptual space, not matched per pixel
Date: 2026-09-09 · Goal: G-001 · Status: superseded (superseded by: D006)
Context: The Owner asked for research before an approach was picked. Consumer tools match colors perceptually, and per-pixel quantization produces "confetti" (isolated single stitches).
Decision: Downsample to the stitch grid first, then run k-means in CIELAB and assign each cell to its nearest palette color by Euclidean Lab distance.
Rejected: median-cut and octree (fast, but palette colors drift from the image's real colors); full CIEDE2000 (complex for a v1 expected to change); matching to a real DMC/Anchor thread table (not requested; later added by D031).
Consequence: Color decisions are made once per stitch, never per source pixel. The distance metric sits behind the quantizer module boundary.
Evidence: HANDOVER.md D1 as of commit f7bb51c (sources listed there).
