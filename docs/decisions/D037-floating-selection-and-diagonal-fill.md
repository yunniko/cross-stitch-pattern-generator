# D037 · Rectangle selections float until merged; the Fill tool is 8-connected
Date: 2026-09-10 · Goal: G-018 · Status: active (superseded by: —)
Context: The Owner asked for select, copy, paste, move and flip, merging when deselected with empty cells overwriting too. Fill should treat diagonal neighbors as connected.
Decision: A FloatingSelection holds lifted cells and an optional originRect to clear. Only mergeSelection writes history, stamping every cell, EMPTY_CELL included. Switching tools or starting a new selection merges first. Paste lands 3 cells down and right. Fill uses a separate 8-connected flood fill.
Rejected: transparent empty cells (Owner said they overwrite); pushing history during a selection (one select session is one undo step); changing the 4-connected cluster fill used by drag-to-recolor (different tool, different rule).
Consequence: Replacing the pattern (Regenerate, Open, new photo) discards a floating selection unmerged. Canvas pixel checks sample at a cell corner offset, not the center.
Evidence: lib/editor/pattern-edit.ts; lib/pipeline/regions.ts; tests/unit/regions.spec.ts; app/hooks/use-canvas-tools.ts; HANDOVER.md D37 as of commit f7bb51c.
