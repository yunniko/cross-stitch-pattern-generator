# D230 · A double-click takes the run, and a run moves as one
Date: 2026-09-25 · Goal: G-073 M3 · Status: active (superseded by: —)
Context: a drawn outline is many segments, and acting on it one at a time is not how anyone thinks of it.
Decision: a double-click selects every line reachable from the one under the pointer by **meeting ends**, in the same thread. Ends only — a line crossing another's middle is a separate stroke. Two rules follow: with more than one line in hand no end grabs, so a press moves the run rather than re-aiming an end; and a press on a line already in hand carries everything in hand.
Force: requirement — the Owner asked for it and for what connected means: "one stitch is started where another ends" (2026-09-25).
Rejected: colour alone (takes unrelated drawings); walking through a crossing (a cross is two strokes); leaving a run un-draggable as a set (every other action already applies to all of it).
Consequence: a drag carries a set, so a frame is all-or-nothing — one line falling off the chart declines the whole frame, and the run keeps its shape.
Evidence: tests/unit/backstitch.spec.ts; tests/e2e/backstitch-edit.spec.ts
