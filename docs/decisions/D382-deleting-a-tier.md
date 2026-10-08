# D382 · A tier is deleted only when no one has had it and none of its prices is offered
Date: 2026-10-08 · Goal: G-127 M2 · Status: active (superseded by: —)
Context: the Owner asked how to delete a tier; there was no way, and subscriptions and prices reference it.
Decision: `deleteTierAction` deletes a tier with its prices and limits only when no subscription row names it, none of its prices is offered, and the provider holds no subscription on any of its prices (`priceInUse`); otherwise the admin stops offering it.
Force: requirement — people's subscriptions and history name the tier and its prices, and a purchase whose webhook is still on its way would fail with an unknown price (`UnknownPriceError`).
Rejected: deleting with everything that names it (loses people's records); a "deleted" flag (a second way of not offering, beside retired prices).
Consequence: a Checkout opened before the price was withdrawn and paid after the delete fails to sync, unverified until test mode; the Stripe product is left as it is.
Evidence: lib/admin/billing-actions.ts; lib/billing/catalog.ts; tests/unit/billing-grants.spec.ts; tests/e2e/admin-billing.spec.ts
