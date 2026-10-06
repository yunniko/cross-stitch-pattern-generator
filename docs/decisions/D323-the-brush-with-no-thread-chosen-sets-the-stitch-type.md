# D323 · The Brush with no thread chosen sets the stitch type of the stitches it crosses
Date: 2026-10-06 · Goal: G-115 M2 · Status: active (superseded by: —)
Context: changing a stitch's type meant repainting it in its own colour, one thread at a time.
Decision: with no thread in the square the button paints with, a Brush stroke gives every stitch it covers (stamp and mirror copies) the stitch type chosen and keeps its colour; an empty stitch is left alone.
Force: requirement — the Owner's instruction of 2026-10-06, and the answer "No thread chosen" to which state means "without color".
Rejected: the Empty square meaning "without color" (Empty already erases); a separate retype tool (not asked for).
Consequence: the state is reached by pressing the active thread's entry again, which releases it (`04`, Choose). A stroke that changes nothing, retyping or under the lock, costs no undo step. Only the Brush retypes; the other tools still do nothing with no thread.
Evidence: tests/e2e/brush-retype.spec.ts
