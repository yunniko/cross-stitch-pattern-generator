# D408 · The fake billing adapter and its pages exist only in builds that ask for them
Date: 2026-10-11 · Goal: G-134 M1 · Status: active (superseded by: —)
Context: the fake Stripe adapter, its Checkout and Portal pages and a public default signing secret were in the production bundle, guarded only at runtime.
Decision: `BILLING_FAKE_BUILD=1` (set by the e2e runners, implied by `next dev`) compiles them in. The pages are `page.fake.tsx`, routed only then, and the adapter loads by dynamic import behind an inlined constant. CI scans the production build for them.
Force: requirement — the Owner's instruction of 2026-10-11 ("take out of production"), and STANDARDS "Nothing test-only ships".
Rejected: keeping the runtime gates alone (the code still ships, and the check would trust a flag); a separate test-only app (a second build to keep in step).
Consequence: e2e must build with `BILLING_FAKE_BUILD=1`. A new fake-only file or route must be added to `scripts/check-no-fake-billing.mjs`, or the scan cannot see it.
Evidence: scripts/check-no-fake-billing.mjs; next.config.ts; lib/billing/gateway.ts
