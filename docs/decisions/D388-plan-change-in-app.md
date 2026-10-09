# D388 · A plan change to more starts now with the difference charged; to less, at the renewal
Date: 2026-10-09 · Goal: G-129 M3 · Status: active (superseded by: —)
Context: the Plan page changes, cancels and keeps a plan held, so nobody needs the provider's Portal for it.
Decision: a longer period, or a dearer price for the same period, starts now and charges the difference for the rest of the period, standing only once paid (Stripe `pending_if_incomplete`) and asked with the purchase's consent; any other change waits for the renewal as a subscription schedule, charging nothing now; changes are refused while a payment fails or the plan is set to end, cancelling is not.
Force: judgment — keeps what was paid for; the Owner's lawyer may adjust it.
Rejected: every change at once with a credit (a downgrade would refund mid-period); every change at the renewal (an upgrade would be paid for and not had).
Consequence: an upgrade grants no new withdrawal period; a cancellation drops a waiting change. Stripe's schedule and pending-update behaviour is unverified until the Owner's test keys (G-106 M4).
Evidence: tests/unit/plan-change.spec.ts; tests/e2e/billing-change.spec.ts