# D366 · Stripe's package pinned at 22.3.0 and its API version at 2026-06-24.dahlia
Date: 2026-10-08 · Goal: G-106 M1 · Status: active (superseded by: —)
Context: the billing core needs a Stripe client, and an account's default API version can change under the app.
Decision: `stripe` 22.3.0 (exact), the API version `2026-06-24.dahlia` set in the adapter, and the package imported only by `lib/billing/stripe-adapter.ts` and `lib/billing/stripe-mapping.ts`.
Force: requirement — STANDARDS.md tech-stack spread (listing-studio already pins `stripe` 22.3) and Stripe's versioned API (S1-S3 of the reference).
Rejected: calling the REST API by hand (re-implements signatures and retries); an unpinned API version (the account default could change field shapes silently).
Consequence: an upgrade changes the package and the version together, and reruns the mapping tests; an ESLint rule refuses the import elsewhere.
Evidence: lib/billing/stripe-adapter.ts; eslint.config.mjs; docs/reviews/2026-10-08-stripe-billing-reference.md