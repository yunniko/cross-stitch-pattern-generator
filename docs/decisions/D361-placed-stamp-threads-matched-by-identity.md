# D361 · A placed stamp's threads are matched by identity, the missing ones added, and a stamp that cannot fit is refused whole
Date: 2026-10-08 · Goal: G-119 M4 · Status: active (superseded by: —)
Context: Placing a stamp must say which of the chart's threads each of its threads is, and what happens when the chart lacks one.
Decision: A thread is the chart's own when it is the same brand and code, or, for a custom colour, the same colour; the rest are added at the palette's end in the same undo step as the piece; a chart of one brand, a full palette or a chart smaller than the stamp refuses it whole, before anything is added.
Force: requirement — the Owner's plan (2026-10-08) names adding a missing thread and refusing a full palette; matching by identity and refusing whole are judgment.
Rejected: matching by nearest colour (silently changes the stamp's threads); adding what fits and dropping the rest (a stamp placed with stitches lost).
Consequence: added threads go at the end, so a piece already in hand keeps its indices when it is applied onto the grown chart.
Evidence: lib/stamps/place.ts; tests/unit/stamp-place.spec.ts; tests/e2e/stamps-add.spec.ts