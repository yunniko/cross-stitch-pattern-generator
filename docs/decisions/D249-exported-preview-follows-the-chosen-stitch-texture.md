# D249 · The exported realistic preview follows the chosen stitch texture
Date: 2026-09-30 · Goal: G-076 M2 · Status: active (superseded by: —)
Context: D248 left exports on the classic texture; the Owner wants the exported preview to match the screen.
Decision: `stitchTexture` travels in the export request (client → processor validation → `cs-job`), and the Rust preview embeds every catalog texture, keyed by id.
Force: requirement — Owner instruction, 2026-09-30 ("it should be applied to exported preview as well").
Rejected: byte-identity between the Rust and screen renderings (the Owner said it is not needed; the earlier assumption came from D173); a client-side export that draws the preview itself (Rust is the only export engine).
Consequence: a new texture is a catalog entry, a file in `public/`, and a row in `TEXTURES` in `rust/cs-export/src/preview.rs`; the Dockerfile copies `public/stitch-texture*.png`. An unknown id draws the classic texture; the processor refuses one that is not in the catalog.
Evidence: scripts/rust-stitch-texture.ts; tests/e2e/stitch-texture.spec.ts; tests/unit/processor-export-validation.spec.ts
