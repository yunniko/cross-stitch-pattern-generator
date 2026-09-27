# D245 · Register/login are server actions, and reuse the job rate limiter
Date: 2026-09-27 · Goal: G-075 M1 · Status: active (superseded by: —)
Context: `lib/server/request-guard.ts` Origin-checks and rate-limits every state-changing Route Handler in front of the processor. Register/login need only the second half — a server action has no cross-origin `Request` to check.
Decision: register, login and logout are server actions (`lib/auth/actions.ts`), matching `listing-studio`'s pattern for the same App Router idiom (typed `useActionState` result, no hand-rolled fetch layer). `request-guard.ts`'s token bucket gained a second `kind` (`auth`, 8/15min) and an `authRateLimited(address)` entry point that spends a bucket without needing a `Request`, rather than a second rate-limit module.
Force: judgment for server actions (a real reason favours them; portfolio consistency is not itself the force); requirement for reusing the limiter (STANDARDS' "one home per shared affordance" — a second bucket implementation nearby is the duplication that rule targets).
Rejected: a Route Handler under `app/api/` (loses typed action state, needs its own fetch layer); a separate rate-limit module (duplicates the bucket mechanics).
Consequence: a future state-changing action that isn't behind a Route Handler reaches for `authRateLimited`-the-pattern (a `spend()`-backed helper), not a new limiter.
Evidence: lib/auth/actions.ts; lib/server/request-guard.ts; tests/unit/request-guard.spec.ts
