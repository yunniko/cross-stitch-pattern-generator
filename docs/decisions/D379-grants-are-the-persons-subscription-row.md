# D379 · A tier given by hand is the person's one subscription row, of kind "grant"
Date: 2026-10-08 · Goal: G-127 M1 · Status: active (superseded by: —)
Context: the admin must be able to give a tier until a date, and the entitlement rule (D367) reads one row per person.
Decision: a grant writes the person's `Subscription` row with `kind: "grant"`, no provider ids and `currentPeriodEnd` as its end (the start of the chosen UTC day); it gives the tier until exactly that instant, and ending it early sets `canceled` and `endedAt`.
Force: judgment — the unique row per person (D370) makes a separate grants table a second source of the tier.
Rejected: a separate grants table (two rows deciding one person's tier); a grant over a bought subscription that may still charge (refused instead, as checkout is refused while a grant lasts).
Consequence: a grant never holds the place, so a bought subscription arriving takes the row and history says "replaced" from "grant"; reconciliation skips rows without a provider id.
Evidence: lib/billing/grants.ts; lib/billing/entitlement.ts; tests/unit/billing-grants.spec.ts; tests/unit/billing-sync.spec.ts; tests/e2e/admin-billing.spec.ts
