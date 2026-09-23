# D217 · The empty stitch is a sentinel, and no tool paints an index the palette lacks
Date: 2026-09-23 · Goal: G-066 M1 · Status: active (superseded by: —)
Context: with the brush holding the empty stitch, any merge then any press killed the page (Owner report, reproduced on production). `withColorRemoved` (G-064 M1) renumbered every held index above the merged one, including `EMPTY_CELL` — 255 became 254, and `drawCell` threw `undefined.rgb` inside the pointer handler. There is no error boundary under the workspace, so the throw ended the session.
Decision: `EMPTY_CELL` is never renumbered, and `paintableIndex` gates every press so a thread the palette no longer has counts as nothing held rather than a cell nothing can draw.
Force: requirement — a reproduced crash that loses the reader's session.
Rejected: guarding inside `drawCell` (the bad index still kills the next full repaint, which threw on `.symbol` in the same report, and exports would write a wrong chart).
Consequence: any new holder of a palette index must treat 255 as a sentinel, not a number to shift. The renderers stay strict on purpose: a bad index is a bug to find, not to paint around.
Evidence: tests/e2e/merge-then-draw.spec.ts; tests/unit/color-slots.spec.ts; lib/editor/color-slots.ts
