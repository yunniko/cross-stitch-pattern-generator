# D251 · The exported preview carries the canvas as one optional `canvas` (colour and cloth)
Date: 2026-09-30 · Goal: G-077 M2 · Status: active (superseded by: —)
Context: the Owner wants a checkbox that puts the canvas into the exported realistic preview, and, with the cloth Off, the canvas colour instead of a transparent ground.
Decision: the export request carries `canvas: { color, texture }` only when the box is ticked; the exporter builds one opaque ground tile (cloth multiplied with the colour, `columns × rows` cells), repeats it from the chart's corner and lays each stitch over it by its alpha.
Force: requirement — Owner instruction, 2026-09-30 (checkbox; texture Off exports the colour, not transparency).
Rejected: three loose fields (colour, texture, flag) that could disagree; byte-identity with the screen or with the TypeScript reference (not required, Owner 2026-09-30).
Consequence: a cloth is a catalog entry, a file in `public/`, and a row in `CANVAS_TEXTURES` in `rust/cs-export/src/preview.rs` with the same columns, rows and offsets; `scripts/rust-canvas.ts` fails if the two lists differ. The Dockerfile and `scripts/build-processor.mjs` copy `stitch-texture*.png` and `canvas-texture*.png` by pattern.
Evidence: scripts/rust-canvas.ts; tests/unit/preview-canvas.spec.ts; tests/e2e/canvas-texture.spec.ts
