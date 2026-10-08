# D378 · A renewal needing the bank's confirmation is read from its payment's intent
Date: 2026-10-08 · Goal: G-126 M2 · Status: active (superseded by: —)
Context: a renewal that waits on the person's bank needs a different message and link from a declined card, and in API dahlia the invoice no longer names its PaymentIntent.
Decision: for a subscription whose latest invoice is open and attempted, the adapter fetches the intent of the newest entry of `invoice.payments` and marks the failure as needing confirmation while that intent is `requires_action`.
Force: judgment — the only typed field that says so (S10 in the reference); unverified until test mode, which waits on the Owner's keys.
Rejected: keying on the `invoice.payment_action_required` event (events are read only for which subscription they concern, D369); one message for both cases (a person waiting on their bank would look for a card problem).
Consequence: one extra API call per failing subscription per sync; G-126 M3 checks the reading against a real 3-D Secure renewal before it is relied on.
Evidence: lib/billing/stripe-adapter.ts; lib/billing/stripe-mapping.ts; tests/unit/billing-adapters.spec.ts; docs/reviews/2026-10-08-stripe-billing-reference.md
