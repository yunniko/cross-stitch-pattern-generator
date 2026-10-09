# D386 · A refund is all that is left, the unused part of its period by exact time rounded up, or an amount
Date: 2026-10-09 · Goal: G-129 M1 · Status: active (superseded by: —)
Context: a consumer's withdrawal keeps only the proportionate amount for the time provided (Directive 2011/83 Art. 14(3)), and the admin could refund only a whole payment.
Decision: `lib/billing/refund-rule.ts` gives back all that is left, the unused share of the period the payment paid for (by exact time, rounded up to the cent, capped at what is left), or an amount the admin enters; the period comes from the payment's invoice lines.
Force: judgment — awaiting the Owner's confirmation (G-129); by day or rounding down would be equally lawful-looking choices.
Rejected: a period guessed from the payment's date and the price's interval (wrong for a late renewal or a change of plan); refunding whole days only (needs a rule for the day of withdrawal).
Consequence: the withdrawal (M2) uses `unusedRefund`; the action works the amount out when pressed, not when the page was read.
Evidence: tests/unit/refund-rule.spec.ts; tests/e2e/admin-subscriptions.spec.ts