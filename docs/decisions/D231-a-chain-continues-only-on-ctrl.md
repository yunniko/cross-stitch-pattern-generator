# D231 · A line ends where it is placed; Ctrl carries the run on
Date: 2026-09-25 · Goal: G-073 M3 · Status: active (supersedes the chaining half of criterion 1)
Context: the tool chained by default — every press started the next line from the last end, and a run stopped only at a double-click or Escape. Drawing one short line cost an extra gesture.
Decision: two presses make one line and the run is over. A press holding **Ctrl** (or **Cmd**) as it places the end makes that end the start of the next line, which is the only way a chain continues.
Force: requirement — the Owner's rework (2026-09-25), replacing what they asked for in criterion 1.
Rejected: chaining by default with a modifier to stop (the common case pays for the rare one); a toggle in Options (a mode nobody can see from the chart).
Consequence: Cmd counts too, since Ctrl with the primary button is a Mac right-click. Double-click and Escape still end a run held open by Ctrl. `drawChain` in the e2e helpers holds Ctrl for every press but the last, so every spec that draws a chain still draws one.
Evidence: tests/e2e/backstitch-draw.spec.ts; app/hooks/use-canvas-tools.ts
