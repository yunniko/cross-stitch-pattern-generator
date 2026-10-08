# D369 · A subscription is stored as a snapshot fetched from the provider, not built from events
Date: 2026-10-08 · Goal: G-106 M1 · Status: active (superseded by: —)
Context: webhook events arrive duplicated, out of order, and sometimes not at all.
Decision: an event only names a subscription; the app fetches that subscription's current state and stores it whole (`syncedAt`), recording each change as a `SubscriptionEvent` and each handled event id in `BillingEvent`.
Force: requirement — Stripe documents duplicate and unordered delivery and warns against ordering by `created` (reference S3).
Rejected: applying each event's payload in arrival order (an old event can overwrite a newer state); ordering by event time (Stripe says not to).
Consequence: the webhook and the reconciliation pass share one write path; handling the same event twice, or events in any order, ends in the same row.
Evidence: lib/billing/contract.ts; lib/billing/stripe-mapping.ts; docs/reviews/2026-10-08-stripe-billing-reference.md