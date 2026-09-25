# D229 · Backstitch editing is one tool
Date: 2026-09-25 · Goal: G-073 M3 · Status: active (supersedes D227)
Context: D227 split editing in two because a press near an end cannot mean both "re-aim this end" and "move this line". The Owner asked why that needs two tools.
Decision: one tool. A press takes whatever line it lands on, wherever on it, so any line moves in one gesture; **only a line already in hand has live ends**, and then a press within `endZoneFor` of one drags that end. The two meanings are separated in time, not by tool.
Force: judgment — the Owner's question; nothing compelled either shape. Re-aiming now costs two gestures, and the rail loses a tool it could not spare at 768 px.
Rejected: D227 (a whole tool for one flag); a modifier key (invisible, untestable as a rail state).
Consequence: hit-testing reads the **unrounded** pointer (`preciseCornerFromEvent`); snapping the press first let each endpoint claim the half-cell around it whatever the end zone said, and left a one-cell line no body to grab. The zone is also capped at a third of the line.
Evidence: tests/unit/backstitch.spec.ts; tests/e2e/backstitch-edit.spec.ts
