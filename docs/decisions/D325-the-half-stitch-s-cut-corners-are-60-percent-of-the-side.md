# D325 · The half stitch's cut corners are 60 % of the side
Date: 2026-10-06 · Goal: G-115 M2 · Status: active (superseded by: —)
Context: the Owner asked for thinner half stitches, cut 50 %; the cut already was 50 % (D262), and the Owner then asked for 60 %.
Decision: `HALF_STITCH_CUT` is 0.6 in `lib/export/half-stitch-shape.ts` and `rust/cs-export/src/halfstitch.rs`; the rest of D259 stands.
Force: requirement — Owner, 2026-10-06: "then do 60%".
Rejected: keeping 50 %.
Consequence: what is left is a diagonal band of 64 % of the cell, 0.8 of the side across; D262's note that more than 50 % leaves a hairline was wrong, that happens only as the cut nears 100 %. The mask sums are 2646, 16698, 94194 for sizes 4, 10, 24 in both test files.
Evidence: tests/unit/half-stitch-render.spec.ts; tests/unit/half-stitch-export.spec.ts; rust/cs-export/src/halfstitch.rs
