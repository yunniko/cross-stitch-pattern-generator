# D263 · Stitch type is three radio icons, and the outline and dot take the stitch's shape
Date: 2026-10-01 · Goal: G-082 · Status: active (superseded by: —)
Context: the Owner asked for radio icons in place of the dropdown, and a way to see on the chart which stitch type is in hand, offering three ideas: an outline with the cut corners, marked outline corners, or a diagonal ellipse for the dot.
Decision: the top-bar choice is a radio group of three icons; for a half stitch the hover outline is the cut cell's own six edges, one shape for each cell of the press, and the pointer dot is an ellipse lying along the thread's diagonal.
Force: judgment — the Owner left the choice among the ideas open.
Rejected: marking only the outline's corners (says less than the shape itself).
Consequence: `stampOutline(stamp, kind)` and `drawPointerDot(ctx, x, y, kind)` take the kind; the hover canvas reports `data-kind` and `data-edges` for the specs.
Evidence: tests/e2e/half-stitches.spec.ts (the radios; the outline and the dot)
