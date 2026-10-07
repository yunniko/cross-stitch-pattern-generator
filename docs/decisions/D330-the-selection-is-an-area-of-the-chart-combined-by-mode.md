# D330 · The selection is an area of the chart, combined by mode
Date: 2026-10-07 · Goal: G-116 M1 · Status: active (superseded by: —)
Context: a selection was one rectangle or one lassoed shape lifted straight into a piece; adding, subtracting, inverting and the wand's colour-wide lines need something to combine.
Decision: `SelectionArea` in `lib/editor/selection-area.ts` is a chart-sized cell mask plus a set of the chart's lines; Select, Lasso and the wand each make one, `combineAreas` joins them by mode, `invertArea` complements one, and `liftArea` lifts the result, the piece recording the lines it took (`originLines`) so a merge clears exactly those.
Force: requirement — Owner, 2026-10-07 (G-116): three modes shared by three tools, with no duplicated combining code.
Rejected: combining floating pieces (a moved piece has two positions; the Owner accepted applying it first, decision (a)); clearing lines at merge by the box rule (it cannot express "every line of a colour").
Consequence: the piece code moved from `pattern-edit.ts` to `lib/editor/floating-selection.ts`, which had outgrown one module; a new selection tool produces an area, never a piece.
Evidence: tests/unit/selection-area.spec.ts
