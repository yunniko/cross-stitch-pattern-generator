# D148 · Cancel drops only the floating piece
Date: 2026-09-17 · Goal: G-043 M1 · Status: active (superseded by: —)
Context: D147 gave Cancel the whole selection session, so cancelling a pasted piece also undid the merge the paste had performed. The Owner narrowed that the next day: "Cancel only current selection operation".
Decision: Cancel is `setSelection(null)` — the floating piece goes, and anything already committed stays: a previous piece merged by a paste, a crop, an earlier deselect. The session snapshot D147 introduced (`sessionBaseRef`, and the copy `paste` took before merging) is removed.
Rejected: keeping the session snapshot behind a second button (two cancels to explain, for a case the Owner did not ask for); undoing the paste's merge only (the same surprise in a smaller form).
Consequence: a lifted piece behaves as before — a lift commits nothing, so Cancel leaves the chart untouched and Undo stays where it was. Undo remains the way back through committed edits.
Evidence: tests/e2e/selection-actions.spec.ts; GOALS.md G-043 progress log
