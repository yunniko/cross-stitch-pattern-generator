# D381 · The admin moves subscribers to the current price from their next renewal, with no charge now
Date: 2026-10-08 · Goal: G-127 M2 · Status: active (superseded by: —)
Context: people keep the price they bought (D368); the admin needs a way to move them to the tier's price offered now.
Decision: `movePrice` changes the subscription's price at the provider with `proration_behavior: "none"`, so nothing is charged now and the next renewal charges the new amount; only a subscription in good standing moves (`moveRefusal`), one person or everyone on a retired price at once, each moved alone.
Force: judgment — a mid-period charge or credit would surprise the person and complicate refunds; good standing only because a failing subscription's price change is not taken by the sync (D376).
Rejected: prorating now (an unannounced charge); moving at the provider by a schedule (another object to keep in step).
Consequence: the site does not tell the person; the admin page says to tell them before a higher price, and an EU price-rise notice is the Owner's to settle in G-128.
Evidence: lib/admin/subscription-actions.ts; lib/billing/admin-view.ts; tests/unit/billing-admin-view.spec.ts; tests/e2e/admin-subscriptions.spec.ts
