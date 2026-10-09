# D387 · A withdrawal runs 14 Prague days from the subscription's start, is recorded first, and refunds each payment's unused part once
Date: 2026-10-09 · Goal: G-129 M2 · Status: active (superseded by: —)
Context: a consumer may withdraw from a digital service within 14 days, owing only the time provided (Directive 2011/83 Art. 9, 14(3)); since June 2026 through an online button with a confirmation step (Directive 2023/2673 Art. 11a).
Decision: the right ends with the 14th Prague day after the subscription's start (`startedAt`, Stripe's `start_date`), not a renewal's; confirming records a `Withdrawal` with its refunds decided then, cancels at once and refunds each payment since the start under keys made from the record's id, under one lock per subscription.
Force: requirement — the directives above; the Prague day count and the renewal rule are judgment awaiting the Owner's lawyer.
Rejected: counting from the first payment's date (a renewal or re-purchase blurs it); working the refund out on each retry (the amount would drift under the same key).
Consequence: a payment with no known period is given back whole; a recorded withdrawal not finished is finished by pressing again.
Evidence: tests/unit/withdrawal.spec.ts; tests/e2e/billing-withdraw.spec.ts