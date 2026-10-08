# D375 · The grace counts from the first failed attempt, kept while failing, bounded by the period
Date: 2026-10-08 · Goal: G-126 M1 · Status: active (superseded by: —)
Context: `past_due` kept the paid tier until the period's end, and a subscription the retries left `past_due` kept it for ever (G-126 acceptance 2).
Decision: a failing subscription keeps its tier until the earlier of the first failure plus the grace days and the period's end plus 2 days; the stored failure date stays the earliest while stored and fetched status are both failing, and clears on payment.
Force: requirement — the Owner's G-126 acceptance 2 (a bounded grace, set by the admin); Stripe's latest-invoice failure date restarts each period (docs/reviews/2026-10-08-stripe-billing-reference.md).
Rejected: counting from the period's end (a renewal failing late in retries gets no grace); trusting the fetched date alone (a new invoice renews the grace).
Consequence: `entitlement`, `hasTier`, `planName` and `planStatusLine` take the policy; server code loads it with `billingPolicy()`.
Evidence: lib/billing/entitlement.ts; lib/billing/sync.ts; tests/unit/billing-scenarios.spec.ts; tests/unit/billing-entitlement.spec.ts
