# D411 · Account routes, processor routes, admin actions and client fetches each go through one helper
Date: 2026-10-11 · Goal: G-134 M3 · Status: active (superseded by: —)
Context: the four account resources, the five processor routes, the admin actions and the browser's JSON fetches each repeated their own refusal, guard and body-reading code, and the environment was read bare where used.
Decision: `lib/server/account-resource.ts`, `lib/server/processor-proxy.ts`, `lib/admin/admin-action.ts` and `lib/api-json.ts` carry that code once; `lib/env.ts` checks the server's environment at start and exits on a bad one.
Force: judgment — G-134's review found the copies drifting (one route lacked retry-after); nothing external compels this shape.
Rejected: a generic route framework (more than four resources need); throwing from `instrumentation.ts` (Next logs it and keeps a dead server up — measured with `next start`).
Consequence: a new account route uses `X.read`/`X.write`; a new admin action wraps `adminAction` or the guard spec fails; a new required variable goes in `readServerEnv`. The rate limits' reliance on nginx is a rule in HANDOVER.
Evidence: tests/unit/account-resource.spec.ts; tests/unit/processor-proxy.spec.ts; tests/unit/admin-actions-guarded.spec.ts; tests/unit/env.spec.ts; tests/unit/api-json.spec.ts; docs/reviews/2026-10-10-code-health-review.md
