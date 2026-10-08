# D368 · Prices are rows of their own, one current per tier and interval
Date: 2026-10-08 · Goal: G-106 M1 · Status: active (superseded by: —)
Context: a tier had one `stripePriceId`, which cannot hold a monthly and a yearly price or a price change that keeps old subscribers on the old price.
Decision: a `Price` row per Stripe price (tier, interval, amount in the minor unit, currency, `current`), and a subscription points at the price it was bought at; `Tier.stripePriceId` is dropped.
Force: judgment — prices change over time while existing subscriptions keep theirs; production held no tier or price to migrate (read-only check, 2026-10-08).
Rejected: a price column per interval on `Tier` (loses history on a change); reading prices live from Stripe on every page (an outage would hide the plans).
Consequence: a price change adds a row and clears `current` on the old one, never edits an amount in place.
Evidence: prisma/schema.prisma; prisma/migrations/20261008235000_billing_core/migration.sql