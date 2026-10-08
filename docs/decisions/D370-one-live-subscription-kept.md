# D370 · A second live subscription is ended at its period's end; a new one replaces one that gives nothing
Date: 2026-10-08 · Goal: G-106 M2 · Status: active (superseded by: —)
Context: a person can finish Checkout twice (two tabs), or subscribe again after an old subscription stopped giving anything, and the schema keeps one row a person.
Decision: a subscription arriving while the person's row is `trialing`, `active` or `past_due` is cancelled at its period's end through the contract and recorded as `second` on that row; one arriving while the row gives nothing takes the row (`replaced`), and the old one, if not final, is cancelled now; a subscription is stored even if it ended before any event arrived.
Force: judgment — Acceptance 6 requires that a second one not keep charging; which one stays and when it ends is chosen here.
Rejected: cancelling the second at once (irreversible; at period end the admin can still undo it); keeping both rows (the rule reads one).
Consequence: G-127's admin page shows `second` entries for a refund decision; the Checkout of M3 refuses while one is live.
Evidence: lib/billing/sync.ts; tests/unit/billing-sync.spec.ts