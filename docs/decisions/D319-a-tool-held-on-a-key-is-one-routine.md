# D319 · A tool held on a key is one routine, and a modifier held alone is a key
Date: 2026-10-06 · Goal: G-104 M1 · Status: active (superseded by: —)
Context: Space borrowed Pan while held; Alt must borrow the picker the same way, and the key grammar could not name a modifier alone.
Decision: the grammar takes `Alt` held alone; one routine borrows one tool at a time, gives it back only on its own key, and restores the previous tool only if the borrowed one is still in hand.
Force: judgment — two copies of the borrow rules would drift; the restore rule keeps a tool chosen mid-hold.
Rejected: a second hook for Alt (the same rules twice); always restoring (it discards a tool chosen mid-hold).
Consequence: held keys are released on window blur (Alt+Tab sends no keyup); a keyup is cancelled only while holding, which keeps Alt from opening the browser menu. Space is taken only with focus on the page or chart, as focused controls press on it; Alt presses nothing, so it is taken anywhere outside a text field. AltGr arrives as `AltGraph` and is never Alt.
Evidence: tests/unit/held-tool.spec.ts; tests/unit/commands.spec.ts; tests/e2e/color-picker.spec.ts
