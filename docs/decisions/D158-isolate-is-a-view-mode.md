# D158 · Isolate is a way of looking, not a tool
Date: 2026-09-18 · Goal: G-045 M4 · Status: active (superseded by: —)
Context: Highlight was one of the exclusive tools, so dimming the threads you were not working on meant putting the Brush down, and a click on a thread either lit it or selected it, never both.
Decision: Highlight leaves the tool union. Isolate becomes its own state, toggled in the context bar, and the overlay is gated on it rather than on the active tool, so it survives picking up a brush. Every thread carries its own light, and lighting the first turns Isolate on so the control does something visible.
Rejected: leaving Highlight a tool and adding a second way to reach it, which keeps the exclusivity that made it awkward; showing the lights only while Isolate is on, which hides them exactly when someone is setting them up.
Consequence: choosing a colour to paint with and lighting one to look at are separate intentions with separate controls. A frozen parity oracle now pins its own copy of the old tool union.
Evidence: tests/unit/reference/chart-scene-pre-g036.ts; GOALS.md, G-045 progress log, 2026-09-18
