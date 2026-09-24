# D225 · A shaped selection carries two masks, not one
Date: 2026-09-24 · Goal: G-072 M1–M2 · Status: active (superseded by: —)
Context: Lasso Select needs a non-rectangular piece, but `FloatingSelection` was a plain box of cells and every operation — lift, stamp, flip, rotate, crop, merge — assumed that.
Decision: an optional `mask` says which cells of the box are in the piece, and a separate `originMask` says which cells it vacates. Absent means the whole rectangle.
Force: requirement — `originRect` deliberately does not follow the piece, so after a rotation one mask cannot describe both the turned piece and the unturned hole it left behind.
Rejected: a subtype for lassos (every call site would branch); `EMPTY_CELL` as "not in the piece" (it is a real value meaning no stitch, G-050/D143); keeping the polygon alongside the cells (the outline must match the stitches actually selected, including holes the path carved).
Consequence: anything rearranging a piece moves `cells` and `mask` together — `withShape` exists so that cannot be forgotten — and leaves `originMask` alone. A new operation reading `cells` directly must ask the mask first, or it stamps cells the user never selected.
Evidence: tests/unit/selection-mask.spec.ts; tests/e2e/lasso-select.spec.ts; lib/editor/lasso.ts
