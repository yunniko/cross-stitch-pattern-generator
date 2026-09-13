# D062 · A goal-number collision is resolved by renumbering the goal with no references
Date: 2026-09-12 · Goal: G-022 sign-off, G-024 · Status: active (superseded by: —)
Context: While moving G-022 to completed goals, two different goals were found numbered G-024: Crisp edges (active, heavily referenced) and a Pattern Keeper PDF export (draft, unreferenced).
Decision: Renumber the unstarted Pattern Keeper goal to G-026 and leave Crisp edges as G-024. Move large goal blocks with a script, not by hand.
Rejected: renumbering Crisp edges (decision records, code comments and tests all cite G-024).
Consequence: Check the goal list for a free number before creating a goal in a parallel session.
Evidence: GOALS.md; HANDOVER.md D62 as of commit f7bb51c.
