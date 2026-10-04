# D280 · A fast lane for small interface-only changes
Date: 2026-10-04 · Goal: G-090 · Status: active (superseded by: —)
Context: every small request was built, fully tested, deployed and documented alone; three palette follow-ups on 2026-10-02 took three deploys.
Decision: a change that touches no chart data or file format, no export, no generation, no `processor/`, `rust/` or account code is verified with type-check, unit tests and the affected browser specs, logged as one line in `GOALS.md` under "Small changes", and deployed in a batch after one full-suite run.
Force: requirement — Owner, 2026-10-04: "Yes" to the fast lane, which relaxes OPERATIONS.md's per-goal steps for this project only.
Rejected: dropping tests for small changes (the affected ones still run); a batch without a full run (the deploy keeps its gate).
Consequence: anything outside those limits, or any doubt, is a normal goal. The batch's deploy row lists what it carried; the design brief and handover are updated per batch.
Evidence: docs/reviews/2026-10-04-growth-readiness.md
