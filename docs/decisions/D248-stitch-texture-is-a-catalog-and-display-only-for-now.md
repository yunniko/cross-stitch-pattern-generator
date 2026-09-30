# D248 · The stitch texture is a catalog choice, display only until exports follow
Date: 2026-09-30 · Goal: G-076 M1 · Status: active (superseded by: —)
Context: the Stitched view had one hard-wired texture; the Owner supplied a second (9 × 9 px) and asked for buttons to switch.
Decision: textures are entries in `lib/export/stitch-texture-catalog.ts`, the choice is a persisted workspace option like `canvasColor`, and every texture is scaled to the cell size, so any pixel size fits.
Force: judgment — nothing compels the split; the Rust preview embeds the classic texture, so following the choice into exports is its own milestone (M2).
Rejected: replacing the classic file (the Owner asked for a choice); changing the export path in the same step (Rust and TypeScript would have to agree byte for byte, D173).
Consequence: until M2 the realistic preview PNG and the `.cspzip` bundle use the classic texture whatever the screen shows. A new texture is a catalog entry plus a file in `public/`.
Evidence: tests/unit/stitch-texture-catalog.spec.ts; tests/e2e/stitch-texture.spec.ts; commit 13c48d2
