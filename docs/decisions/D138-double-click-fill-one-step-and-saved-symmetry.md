# D138 · A brush double-click fill is one undo step; symmetry is saved as an optional file field
Date: 2026-09-15 · Goal: G-037 M2 · Status: active (superseded by: —)
Context: a double-click fill left three undo steps (D086), and the Owner wants symmetry toggles kept with the document without making them undoable.
Decision: the brush records the pattern before the first click and the patterns its clicks commit; the fill calls the history `replaceSince`, which swaps exactly those steps for the fill when they are still at the top, and otherwise adds the fill as an ordinary step. Symmetry lives outside the history and is written to the JSON file and autosave only when an axis is on, as an optional field without a format-version bump; missing or unreadable values open with symmetry off.
Rejected: deferring the first click commit until the double-click window passes (D086: delays every click); making symmetry part of the pattern snapshots (toggles would become undo steps).
Consequence: history identity checks, not timing, decide the rewind; a file saved with symmetry off stays byte-identical to one saved before G-037.
Evidence: tests/unit/undo-history.spec.ts; tests/unit/symmetry-persistence.spec.ts; tests/e2e/keyboard-shortcuts.spec.ts
