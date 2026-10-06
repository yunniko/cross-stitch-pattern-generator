# D319 · A tool held on a key is one routine, and a modifier held alone is a key
Date: 2026-10-06 · Goal: G-104 M1 · Status: active (superseded by: —)
Context: Space already borrowed Pan while held; Alt must borrow the picker the same way, and the key grammar had no way to name a modifier on its own.
Decision: the grammar takes `Alt` as a key held alone; one routine borrows one tool at a time, gives it back only on its own key, and restores the previous tool only if the borrowed one is still in hand.
Force: judgment — two copies of the borrow-and-give-back rules would drift; the restore rule keeps a tool chosen mid-hold.
Rejected: a second hook for Alt (the same rules twice); restoring whatever was in hand before (it throws away a tool the person chose while holding).
Consequence: every held key is released on window blur (Alt+Tab never sends the keyup), and its keyup is cancelled only while it holds, which stops Alt opening the browser menu without swallowing other Alt keys. AltGr arrives as `AltGraph` and is never Alt.
Evidence: tests/unit/held-tool.spec.ts; tests/unit/commands.spec.ts; lib/editor/held-tool.ts
