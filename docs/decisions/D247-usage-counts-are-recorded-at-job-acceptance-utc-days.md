# D247 · Usage counts are recorded at job acceptance, windowed by UTC calendar days
Date: 2026-09-27 · Goal: G-075 M4 · Status: active (superseded by: —)
Context: `/admin/stats` needs one clear meaning for its counts. The job-start routes know a job's kind at
acceptance; whether it later finishes, and a reader's timezone, are both facts this dashboard can't easily know.
Decision: record a `UsageEvent` right after the processor accepts the job (not when it later finishes), and
window "today"/"7/30 days" by UTC calendar days.
Force: judgment — nothing requires either choice; both are cheap to change if the numbers ever mislead.
Rejected: counting on completion (needs a second write path, from the client or an SSE listener reporting
back); a reader's local timezone (an internal dashboard, not reader-facing).
Consequence: a job accepted but later failing still counts; completion-only counts would move the write to
`app/api/jobs/[id]/result/route.ts`, which would then need to carry the job's kind (it serves both generically).
Evidence: lib/admin/usage.ts, lib/admin/usage-windows.ts; tests/unit/admin-usage-windows.spec.ts;
tests/e2e/admin-stats.spec.ts.
