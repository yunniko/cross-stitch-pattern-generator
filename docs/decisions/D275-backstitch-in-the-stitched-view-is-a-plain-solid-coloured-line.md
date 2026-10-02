# D275 · Backstitch in the Stitched view and the realistic preview is a plain solid coloured line
Date: 2026-10-02 · Goal: G-086 · Status: active (superseded by: —)
Context: the Stitched view and the realistic preview export drew the stitches only, so a chart with backstitch looked as if it had none (Owner, 2026-10-02).
Decision: both draw each line over the stitches, in its thread's colour, a fifth of a cell wide and solid; the editor on its canvas, the export by laying antialiased lines over each strip of rows as the encoder asks for it, in Rust and TypeScript with the same arithmetic.
Force: requirement — Owner: "so far, just a coloured line", textured later. Solid, not dashed, is judgment: dashes tell threads apart on a printed chart, not in a view of the finished piece.
Rejected: the Color view's dashes (they cut the line in the view meant to look finished); a whole-preview overlay picture (the export is streamed to spare memory).
Consequence: a textured thread replaces the plain line later, in `drawScene` and `overlay_backstitch`; the two preview tests pin both renderers' numbers.
Evidence: tests/e2e/backstitch-stitched-view.spec.ts; rust/cs-export/tests/preview_backstitch.rs
