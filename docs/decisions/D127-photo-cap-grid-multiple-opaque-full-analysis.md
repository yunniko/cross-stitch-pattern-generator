# D127 · The photo cap is an exact grid multiple on opaque photos, with enhancement analysed on the full photo
Date: 2026-09-14 · Goal: G-035 M3 · Status: superseded (superseded by: D130)
Context: The Owner allows shrinking the photo before generation to at least 2 source pixels per stitch. Codex's critique found alignment, transparency, orientation and enhancement pitfalls in the first design.
Decision: One entry point, generateFromPhoto, shrinks an opaque photo to exactly grid × factor pixels with the pipeline's linear-light box filter, keeps the original's orientation, and applies enhancement parameters analysed on the full photo.
Rejected: capping transparent photos (8-bit alpha rounding can turn a faint stitch white); analysing enhancement on the smaller copy (different statistics and CLAHE tiles, and the preview analyses the full photo, D116); a worker-only cap (golden hashes would never exercise it).
Consequence: Uncapped generation is unchanged and still pinned by golden hashes. Capped generation is covered by the entry point's own tests. Which factor ships, and any spatial recalibration, is a separate decision.
Evidence: G-035 M3 progress log.; commit 9b8de28 (tests removed with the cap, D130)
