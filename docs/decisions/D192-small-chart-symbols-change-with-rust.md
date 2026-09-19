# D192 · Chart PNGs ship with Rust's 4–5 px symbols, which differ visibly from production's
Date: 2026-09-20 · Goal: G-048 M5 · Status: active (superseded by: —)
Context: on chart PNGs whose longer side is about 890–1333 stitches the cell is 6–9 px, so symbols are drawn at 4–5 px. Production's Skia hints them into light blocks; Rust draws the unhinted outline (D187).
Decision: chart PNGs ship with Rust's rendering, the difference accepted rather than chased.
Force: requirement — Owner instruction (2026-09-20) after being shown the comparison; the difference is visible to users, so it was not JulAI's to settle.
Rejected: keeping TypeScript for chart PNGs alone (it is 2.0–4.6× slower and holds 510–665 MB against 138–160); emulating hinting in Rust (a font-rasteriser rewrite to reproduce output that is less legible).
Consequence: a user regenerating a chart PNG in that size range sees different symbols from before. Below 890 stitches only anti-aliased edges differ; above 1333 no symbols are drawn. The A4 pages and the PDF are unaffected.
Evidence: docs/reviews/2026-09-19-rust-m4-exports.md; docs/reviews/2026-09-20-rust-comparison-report.md
