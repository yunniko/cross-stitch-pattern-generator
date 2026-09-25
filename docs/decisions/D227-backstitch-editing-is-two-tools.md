# D227 · Backstitch editing is two tools, separated by whether the end zones grab
Date: 2026-09-25 · Goal: G-073 M3 · Status: superseded by D229
Context: a line must be both re-aimable (drag one end) and movable (drag the whole line), and a press near an end cannot mean both.
Decision: one hook, two rail entries. **BS select** grabs an endpoint within `END_ZONE_CELLS` (0.42) of the press; **BS move** grabs only the body. Ends win over bodies, and the later line wins where two overlap.
Force: requirement — the Owner asked for both behaviours (2026-09-25). One tool cannot offer both for a press near an end, and a six-cell line is over half end zone.
Rejected: a modifier key (invisible, untestable as a rail state); choosing the nearer end past a threshold (one press still means two things, by arithmetic the user cannot see); handles shown only once selected (a press must select and act in one gesture, as cell selection does).
Consequence: every new backstitch gesture says which tool it belongs to; `hitLine`'s `grabEnds` flag is the only difference between the two, so branching on the active tool anywhere else is a smell.
Evidence: tests/unit/backstitch.spec.ts; tests/e2e/backstitch-edit.spec.ts; lib/editor/backstitch.ts
