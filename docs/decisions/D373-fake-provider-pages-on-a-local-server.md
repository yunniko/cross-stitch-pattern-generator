# D373 · On a local server the fake provider has pages, and posts its events to the real webhook
Date: 2026-10-08 · Goal: G-106 M3 · Status: active (superseded by: —)
Context: Acceptance 9 needs browser tests of buying without Stripe keys, and M2 left the Postgres store unexercised.
Decision: with `BILLING_GATEWAY=fake` (local addresses only), `/billing/fake-checkout` and `/billing/fake-portal` stand in for Stripe's pages, the fake sells the `Price` rows, and its events are posted signed to `/api/billing/webhook`; the adapter is one per process, on `globalThis`.
Force: judgment — STANDARDS "verified means the path production runs": the webhook route, signature check and store run as for Stripe.
Rejected: calling the sync in-process from the pages (skips the route and the signature); a separate fake server (a second process to keep in step).
Consequence: the pages ship but are not found unless the fake is the adapter; "End the period now" exists only there.
Evidence: app/billing/fake-actions.ts; lib/billing/fake-delivery.ts; lib/billing/gateway.ts; tests/e2e/billing-buy.spec.ts