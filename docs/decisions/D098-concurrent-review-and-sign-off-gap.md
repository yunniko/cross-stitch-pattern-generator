# D098 · A concurrent review's findings are recorded for triage; goals need explicit Owner sign-off
Date: 2026-09-12 · Goal: G-024, G-026 closure · Status: active (superseded by: —)
Context: Another session wrote an architecture and code review into this tree mid-session. It found data-loss bugs, large ICM inefficiency, placeholders in the G-024 delivery doc, and G-024 marked DONE without Owner sign-off.
Decision: Record the findings for Owner prioritization, fill the placeholders, flag the missing sign-off to the Owner, and recommend one git worktree per concurrent session.
Rejected: silently keeping G-024's DONE status; planning the findings as work without the Owner (they became G-031 at the Owner's instruction).
Consequence: A goal isn't DONE until sign-off is logged. Concurrent sessions each need their own worktree.
Evidence: docs/reviews/2026-09-12-architecture-and-code-review.md; COMPANY/OPERATIONS.md; HANDOVER.md D98 as of commit f7bb51c.
