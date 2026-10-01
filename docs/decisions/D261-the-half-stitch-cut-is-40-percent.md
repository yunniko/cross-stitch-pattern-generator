# D261 · The half stitch's cut corners are 40 % of the side
Date: 2026-10-01 · Goal: G-082 · Status: active (superseded by: —)
Context: D259 set the two cut corners at 30 %; the Owner looked at it live and said 40 % would read better ("you were right, try 40% of cut").
Decision: `HALF_STITCH_CUT` is 0.4 in `lib/export/half-stitch-shape.ts` and `rust/cs-export/src/halfstitch.rs`; everything else of D259 stands (shape, mask, Rust twin).
Force: requirement — Owner, 2026-10-01: 40 %.
Rejected: keeping 30 % (the diagonal read too faintly at small cell sizes, per the Owner).
Consequence: the mask sums asserted in `tests/unit/half-stitch-export.spec.ts` and in `halfstitch.rs` were recomputed (3410, 21672, 123258 for sizes 4, 10, 24); a later change of the constant needs the same.
Evidence: tests/unit/half-stitch-render.spec.ts; tests/unit/half-stitch-export.spec.ts; rust/cs-export/tests/half_stitches.rs
