# D254 · The keyboard cell cursor dispatches the pointer events it stands for
Date: 2026-10-01 · Goal: G-080 M1 · Status: active (superseded by: —)
Context: with the system pointer hidden over the chart (D252) the highlighted stitch hides where in it the pointer is; the Owner chose a dot at the pointer and a keyboard cursor over hysteresis, animation and a locked "grid cursor" mode.
Decision: the arrow keys and Enter become `pointermove`, `pointerdown` and `pointerup` events dispatched on the chart frame at the stitch's centre (pointer id 4242), so every tool, the lock, the outline, the rulers and the status bar treat them as the mouse.
Force: judgment — a second, keyboard-only path through each tool would work, but would have to be kept equal to the pointer path.
Rejected: calling each tool's handlers directly (duplicates the dispatch in `workspace.tsx`); Space as the pen (it is the temporary pan).
Consequence: a tool that needs a live pointer must not assume pointer capture works (`capturePointer` refuses quietly). A focused tab, slider, radio or field keeps the arrows; Enter is the pen on the page, in the well, or with the pointer over the chart.
Evidence: tests/e2e/keyboard-cursor.spec.ts; tests/unit/keyboard-cursor.spec.ts
