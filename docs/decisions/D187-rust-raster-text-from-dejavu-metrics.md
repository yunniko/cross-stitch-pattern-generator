# D187 · Rust rasters draw DejaVu text from measured canvas metrics, compared by pixel difference
Date: 2026-09-19 · Goal: G-048 M4 · Status: active (superseded by: —)
Context: raster exports draw text with Skia through @napi-rs/canvas; Rust has no Skia. Criterion 3 compares rasters by size and per-channel difference, not bytes.
Decision: `cs-export` shapes text with rustybuzz and fills DejaVu Sans outlines with tiny-skia, using baseline offsets and widths fitted to the processor's canvas and Skia's fake-bold stroke.
Force: requirement — criterion 3 of G-048 sets raster equivalence by difference; byte-identity would need Skia itself.
Rejected: linking Skia (a large C++ build in the image for text alone); bitmap glyph atlases from TypeScript (a second source of truth for every font size).
Consequence: layouts, fills and lines match exactly; glyph edges differ (largest channel difference 238, means under 2.1) because Skia hints and gamma-corrects glyphs. A change to fonts or text layout re-runs the calibration test in `rust/cs-export/src/text.rs`.
Evidence: rust/cs-export/src/text.rs; scripts/rust-export-parity.ts; docs/reviews/2026-09-19-rust-m4-exports.md
