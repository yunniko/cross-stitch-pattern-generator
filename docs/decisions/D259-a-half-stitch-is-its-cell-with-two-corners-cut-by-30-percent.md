# D259 · A half stitch is its cell with two opposite corners cut away, 30 % of the side
Date: 2026-10-01 · Goal: G-082 M3 · Status: active (superseded by: —)
Context: a half stitch must read on a chart and in the Stitched view as half a cross, while keeping the cell's symbol and thread colour.
Decision: draw the cell in its colour minus two right-triangle corners with legs of `HALF_STITCH_CUT` = 0.3 of the side ("/" loses top-left and bottom-right, "\" the other two); the Stitched view and the preview picture multiply the stitch texture's alpha by a 4 × 4 supersampled mask of the same shape.
Force: requirement — Owner, 2026-10-01: "Let's go with 30 %", opposite corners cut transparent.
Rejected: a line drawn across the cell (not what the Owner described); cutting corner to corner (leaves a hairline).
Consequence: the Rust exporter's constant and mask must equal `lib/export/half-stitch-shape.ts` (a test compares them); the one-pixel-per-stitch screen fast path is skipped for a chart that has half stitches.
Evidence: tests/unit/half-stitch-render.spec.ts; tests/e2e/half-stitches.spec.ts; lib/export/half-stitch-shape.ts
