# D372 · Buying starts hidden, by a site row its migration writes
Date: 2026-10-08 · Goal: G-106 M3 · Status: active (superseded by: —)
Context: buying must stay hidden in production until G-128 is signed off, but a feature with no row is on (G-102).
Decision: the feature `billing.buy` is listed in the registry, and migration `20261008235900_buying_hidden` writes its site row as HIDDEN unless a row exists; the Plan section and Checkout both check it.
Force: requirement — Owner constraint for G-106 to G-128: buying is a hidden feature in production until G-128's sign-off.
Rejected: relying on billing being off without keys (one guard, and it lifts the moment test keys are set); a hidden-by-default flag in the feature model (a change to every feature for one).
Consequence: launching is the admin setting `billing.buy` on; the Portal is never under this feature, so a buyer can always cancel.
Evidence: prisma/migrations/20261008235900_buying_hidden/migration.sql; lib/billing/purchase.ts; tests/e2e/billing-buy.spec.ts