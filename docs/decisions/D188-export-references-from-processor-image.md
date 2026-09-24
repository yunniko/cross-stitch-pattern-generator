# D188 · Export references are made in the production processor image
Date: 2026-09-19 · Goal: G-048 M4 · Status: historical (the harness it describes was deleted in G-068 M3; see D221)
Context: the laptop's @napi-rs/canvas resolves the font stack to Arial; the processor image has only DejaVu Sans. Raster references made on the laptop would not be what production exports.
Decision: `scripts/rust-export-reference.ts` is bundled and run in the processor image on the host; the parity harness compares Rust against that directory.
Force: requirement — measured: the laptop's canvas text differs from the image's on every raster.
Rejected: bundling DejaVu into the laptop canvas (still not the image's exact Skia and fontconfig); comparing against laptop references (tests a font production never uses).
Consequence: regenerating raster references needs the processor image; JSON, OXS and PDF text comparisons are font-independent.
Evidence: as of commit bf726db, before the deletion — scripts/rust-export-reference.ts; scripts/rust-export-parity.ts
