# D236 · A drag places the line where it lets go
Date: 2026-09-25 · Goal: G-073 · Status: active (superseded by: —)
Context: the draw tool had no pointer-up handler at all. A finger dragging across the chart opened a run at the press corner and nothing closed it, so the *next* tap placed the line's end somewhere else entirely — reported by the Owner on mobile.
Decision: the press that opens a run remembers itself; releasing on a different corner places the line there and ends the run, or carries it on when Ctrl is held. A press and release on the same corner is still a tap, so tap-then-tap drawing is unchanged.
Force: requirement — drawing with a finger means dragging, and the tool was unusable that way.
Rejected: a pixel threshold for "is this a drag" (a corner apart is already the smallest drawable line); treating every release as an end (a tap would draw a zero-length line and cancel the run).
Consequence: only the press that *opens* a run is tracked. A press continuing a chain already places its own segment, and would otherwise place a second one on release.
Evidence: tests/e2e/backstitch-draw.spec.ts
