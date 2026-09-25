# D228 · A cell selection takes a line by both ends
Date: 2026-09-25 · Goal: G-073 M3 · Status: active (superseded by: —)
Context: a piece is cells, backstitch is corners. A selection had to decide which lines travel with it, and a shaped piece what "inside" means for a point that is not a cell.
Decision: a piece takes a line when both ends are inside its rectangle; under a mask, a corner is inside when **any** cell meeting it is kept. Carried lines live in the piece's own corner coordinates, are copied at lift, and the originals go at merge, as the cells beneath them do.
Force: requirement — the Owner set the both-ends rule (2026-09-25). A line has no partial form, so one end inside cannot mean half a line moves.
Rejected: any line the rectangle touches (a piece would drag lines off drawings it does not contain); the mask's bounding box (a lasso would take lines it excluded).
Consequence: corner arithmetic is `width - x`, the cells` `width - 1 - cx`; a transform added to `withShape` supplies both, and the spec below pins the pair.
Evidence: tests/unit/backstitch.spec.ts; lib/editor/pattern-edit.ts
