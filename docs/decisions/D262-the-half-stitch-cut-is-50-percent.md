# D262 · The half stitch's cut corners are 50 % of the side
Date: 2026-10-01 · Goal: G-082 · Status: active (superseded by: —)
Context: D261 set the cut at 40 %; the Owner then asked for 50 % ("let's go 50%").
Decision: `HALF_STITCH_CUT` is 0.5 in `lib/export/half-stitch-shape.ts` and `rust/cs-export/src/halfstitch.rs`; the rest of D259 stands.
Force: requirement — Owner, 2026-10-01: 50 %.
Rejected: keeping 40 %.
Consequence: at 50 % each cut reaches the middle of two sides, so what is left is a diagonal band of half the cell's area; the mask sums in `tests/unit/half-stitch-export.spec.ts` and `halfstitch.rs` were recomputed (3186, 19440, 110916 for sizes 4, 10, 24). More than 50 % would leave a hairline.
Evidence: tests/unit/half-stitch-render.spec.ts; tests/unit/half-stitch-export.spec.ts; rust/cs-export/tests/half_stitches.rs
