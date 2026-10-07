# D332 · The Magic wand is a third selection tool, with its own region switches
Date: 2026-10-07 · Goal: G-116 M3 · Status: active (superseded by: —)
Context: the wand selects a colour's region, or every backstitch line of a colour, and must share the selection modes and bar without duplicating Select's code.
Decision: the wand is a third definition in `app/tools/select.tsx` sharing `useSelectTool`; its click makes an area with `wandArea` (`lib/editor/selection-area.ts`), and its switches come from the same `regionSwitches` declaration as Fill's, under its own ids (`wandDiagonal`, `wandColorOnly`).
Force: requirement — Owner, 2026-10-07 (G-116): "the same toolbar as selection", "switches as in fill", "code is not duplicated"; separate storage is decision (e).
Rejected: a separate wand module (a second piece in hand, and a copy of the bar's wiring); sharing Fill's option ids (one switch would change both tools).
Consequence: a piece may hold lines and no stitches, so its lines count as the piece when pressed and are traced in its outline (`drawPieceOutline`). A line press uses `hitLine`, as the backstitch tools do.
Evidence: tests/e2e/magic-wand.spec.ts; tests/unit/selection-area.spec.ts
