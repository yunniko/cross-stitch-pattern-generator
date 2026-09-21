# D202 · One fixed seed, and marks sized in stitches
Date: 2026-09-21 · Goal: G-054 M1 · Status: active (superseded by: —)
Context: the drawn family (D201) is the first pipeline stage fed by a random stream, and the first whose look depends on the chart's size rather than only on the photo.
Decision: one fixed seed (`0x1d10c0de`) for every chart, and a mark spacing in stitches (6) rather than a share of the chart.
Force: requirement for the seed — the golden hashes (D107) and the Rust parity corpus need one input to give one chart, and `mulberry32` is integer-only in both languages, so they agree bit for bit. Judgment for the size: at a fixed stitch spacing a bigger chart carries more marks rather than bigger ones, which keeps a 600-stitch chart from looking screened and an 80-stitch one from becoming three blots.
Rejected: seeding from the photo's hash — the same photo at two sizes would then be drawn in unrelated ways; spacing as a share of the chart, which ties mark size to how big the piece is.
Consequence: every chart of a size shares its placement — the price of reproducibility.
Evidence: lib/pipeline/dither-hand-drawn.ts; tests/unit/dither-hand-drawn.spec.ts
