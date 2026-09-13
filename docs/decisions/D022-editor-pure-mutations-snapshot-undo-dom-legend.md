# D022 · The editor uses pure pattern mutations, a snapshot undo stack and a DOM legend
Date: 2026-09-09 · Goal: G-007 · Status: active (superseded by: —)
Context: The editor needed merge, cluster fill, painting, color edits, undo/redo and save/load on generated patterns.
Decision: Pure functions return a new StitchPattern. Fill reuses the pipeline's 4-connected region labeling. Undo is a capped stack of full snapshots. The legend is real DOM, the canvas draws only the grid, react-colorful is the picker, and an added color is named by nameNewColor without renaming the others.
Rejected: diff-based undo (a snapshot is at most a few MB); a canvas-drawn interactive legend (no hit-testing); re-running nameColors on add (would rename existing colors).
Consequence: The deserializer rejects malformed files rather than producing broken patterns (extended by D099). Every cellPalette mutation must return a new pattern.
Evidence: lib/editor/pattern-edit.ts; lib/editor/use-undo-history.ts; tests/unit/pattern-edit.spec.ts; HANDOVER.md D22 as of commit f7bb51c.
