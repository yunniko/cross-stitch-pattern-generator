# D278 · The Crop tool's numbers say how far each edge moves in, and the frame may grow the chart
Date: 2026-10-03 · Goal: G-089 · Status: active (superseded by: —)
Context: the canvas numbers took positive to add and negative to crop, which reads backwards against a frame drawn on the chart.
Decision: a number is the stitches that edge moves **in**: positive cuts, negative adds empty stitches; `lib/editor/crop-frame.ts` turns it round into `resizeCanvas`'s amounts, so Apply is that one function.
Force: requirement — Owner, 2026-10-03: "Go with your proposals through all milestones" (sign reversed, growing allowed by typing or dragging, Apply on request, the selection's Crop kept).
Rejected: keeping the old sign (the frame's picture and the number would disagree); a second resize routine (two sets of limits and messages, against D109).
Consequence: a drag is clamped to at least one stitch and at most 1500 a side; a typed number is not clamped but refused with `resizeCanvas`'s own words. The selection's action is renamed "Crop to selection".
Evidence: tests/unit/crop-frame.spec.ts; tests/e2e/crop-tool.spec.ts
