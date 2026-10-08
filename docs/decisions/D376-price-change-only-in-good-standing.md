# D376 · A change of price is taken only from a subscription in good standing
Date: 2026-10-08 · Goal: G-126 M1 · Status: active (superseded by: —)
Context: Stripe applies a plan change before its prorated payment succeeds, so a failing upgrade would otherwise buy the new tier.
Decision: when the fetched subscription is not `trialing` or `active`, the stored price and tier are kept; the new price is taken with the first snapshot in good standing.
Force: requirement — Stripe's default plan-change behaviour (docs/reviews/2026-10-08-stripe-billing-reference.md, S5); the Portal's own behaviour is unconfirmed.
Rejected: `pending_if_incomplete` alone (the Portal may not use it); revoking access on a failed change (punishes a paying person for an upgrade's failure).
Consequence: a failing subscription keeps its old tier through the grace (D375); a downgrade while failing also waits for payment.
Evidence: lib/billing/sync.ts; tests/unit/billing-scenarios.spec.ts (scenario 9)
