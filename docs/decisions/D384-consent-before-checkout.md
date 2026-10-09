# D384 · A buyer agrees to the terms and acknowledges losing the right of withdrawal before Checkout, and is sent a confirmation
Date: 2026-10-09 · Goal: G-128 M2 · Status: active (superseded by: —)
Context: a plan starts at once, so EU consumer law asks for the buyer's express consent and acknowledgment beforehand, and a confirmation afterwards.
Decision: the Plan page's Choose buttons stay off until both boxes are ticked; the server refuses unless all three documents are published and the posted versions are those in force, writes a `PurchaseConsent` row, and passes its id through Checkout's metadata; the first sync of a started subscription ties the row and queues one "your plan has started" mail repeating the plan, the terms version and the acknowledgment.
Force: requirement — Directive 2011/83/EU, articles 8(7) and 16(m), as G-128's acceptance criteria name them.
Rejected: consent kept only in Stripe (no tie to our document versions); the confirmation sent at Checkout (the plan may never start).
Consequence: unlinked consents are pruned after two days by the reconcile job. Owner's question: whether the mail's link to the terms counts as a durable medium, or the text must be attached.
Evidence: lib/billing/consent.ts; tests/unit/billing-consent.spec.ts; tests/e2e/billing-buy.spec.ts; tests/e2e/billing-failure.spec.ts