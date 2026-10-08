# D377 · Failure notices are an outbox, one row per failure and slot, queued in the sync's transaction
Date: 2026-10-08 · Goal: G-126 M2 · Status: active (superseded by: —)
Context: events arrive repeated, shuffled or late, and the grace ends with no event at all, yet each message must go once per failure (G-126 acceptance 3).
Decision: `planNotices` compares the stored row before and after each sync and queues `BillingNotice` rows, unique per subscription, first failure date and slot, in the sync's locked transaction; delivery claims each row before sending, after the webhook and on the hourly reconciliation.
Force: requirement — the Owner's G-126 acceptance 3 (each message once per failure) and Stripe's unordered, repeated delivery (docs/reviews/2026-10-08-stripe-billing-reference.md).
Rejected: sending from the webhook handler (a repeat or a reordering sends twice, and the grace's end has no event); Stripe's own dunning mail (it cannot say what the site keeps or when the tier ends).
Consequence: a new billing message is a slot in `planNotices` and an entry in `lib/mail/messages.ts`; a person who asked for the plan to end is never chased; a notice unsent after 5 tries or 3 days is dropped.
Evidence: lib/billing/notices.ts; lib/billing/sync.ts; tests/unit/billing-notices.spec.ts; tests/unit/billing-scenarios.spec.ts; tests/e2e/billing-failure.spec.ts
