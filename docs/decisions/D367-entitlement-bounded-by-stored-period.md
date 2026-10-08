# D367 · A tier is given only until the stored period's end, plus two days for a late record
Date: 2026-10-08 · Goal: G-106 M1 · Status: active (superseded by: —)
Context: the old rule gave the tier to any active-looking status, so a subscription left `past_due` kept it for ever.
Decision: `trialing`, `active` and `past_due` give the tier until `currentPeriodEnd` plus two days; every other status, a missing period end, or an unknown status gives Free.
Force: judgment — Stripe may leave a failing subscription `past_due` indefinitely and records may arrive late; the two days and the interim `past_due` treatment are choices G-126's grace replaces.
Rejected: trusting the status alone (failing subscriptions never lose access); no allowance (a delayed webhook would drop a paying person to Free).
Consequence: every check of access goes through `hasTier`/`entitlement` with `ENTITLEMENT_SELECT`; G-126 changes `past_due` here, nowhere else.
Evidence: lib/billing/entitlement.ts; tests/unit/billing-entitlement.spec.ts; docs/reviews/2026-10-08-stripe-billing-reference.md