# D318 · Alt borrows the picker from the tools that paint, named by a trait of their own
Date: 2026-10-06 · Goal: G-104 M1 · Status: active (superseded by: —)
Context: holding Alt must pick a colour from the drawing tools only; the editor needs to know which those are.
Decision: a tool definition carries `heldPicker: true` (Brush, Fill, Line, Rectangle, Oval, Lasso fill); only those borrow the picker on Alt.
Force: requirement — the Owner's list of drawing tools (G-104, 2026-10-06; Lasso fill added in the accepted plan), with Zoom keeping its own Alt.
Rejected: reading `shares: colours` (Select, Lasso and the backstitch tools share colours too, and Alt would take them over); a list of ids in the workspace (a new drawing tool would have to be added in two places).
Consequence: a new tool that paints with the colour in hand says `heldPicker: true` in its own definition, or Alt does nothing over it.
Evidence: tests/unit/tool-registry.spec.ts; app/tools/types.ts
