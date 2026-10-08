# D380 · The admin makes prices through the billing contract, never edits one
Date: 2026-10-08 · Goal: G-127 M1 · Status: active (superseded by: —)
Context: tiers and prices must be made and replaced from the admin area, and a provider's price cannot change its amount.
Decision: `createPrice` makes the price (and, with the tier's first, its product, kept in `Tier.stripeProductId`) under an idempotency key sent by the form; the new row becomes current and the other current rows of that tier and period stop being offered, deactivated at the provider best-effort after the database write.
Force: requirement — Stripe prices are immutable in amount, and D366 keeps the `stripe` package inside the adapter.
Rejected: editing a price row (the provider would charge the old amount); deactivating at the provider before the write (a failure would leave nothing offered).
Consequence: subscriptions on a retired price keep it (D368); whether amounts include VAT (`tax_behavior`) is left unset for the Owner to settle in G-128.
Evidence: lib/admin/billing-actions.ts; lib/billing/catalog.ts; lib/billing/stripe-adapter.ts; tests/unit/billing-grants.spec.ts; tests/e2e/admin-billing.spec.ts
