# D023 · A brush stroke is one undo step; colors are renamed by hand; the legend sorts a copy
Date: 2026-09-10 · Goal: G-008 · Status: active (superseded by: —)
Context: The Owner wanted drag painting, a legend sorted by stitch count, and names like "pink" and "dark pink" for similar colors.
Decision: A stroke paints a working copy under pointer capture and commits once on pointer-up. Colors can be renamed by double-clicking the legend name. The legend renders a count-sorted copy, while interactions key off each color's stable index.
Rejected: pushing history on every pointermove (floods the stack; Undo would revert one cell); a relative hue-family naming algorithm (large and risky, and the Owner had named manual rename as the fallback); fixed name dictionaries such as color-name-lists (they can't produce coherent relative pairs).
Consequence: D104 later made strokes redraw only changed cells, keeping the one-commit rule.
Evidence: lib/editor/pattern-edit.ts; tests/e2e/editing.spec.ts; HANDOVER.md D23 as of commit f7bb51c.
