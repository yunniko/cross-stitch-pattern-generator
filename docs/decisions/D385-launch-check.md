# D385 · The launch check is a read-only script over an internal status route, the public site and a test-clock file
Date: 2026-10-09 · Goal: G-128 M3 · Status: active (superseded by: —)
Context: before real money is taken, the webhook, reconciliation, live keys, buying's state, the documents and the test-clock run must all be confirmed against production, not remembered.
Decision: `npm run launch:check -- --site <public> --status <app without nginx>` reads `/api/billing/launch-status` (the reconciliation's token, refused through nginx; it reports a key's mode, never the key), sends the webhook one unsigned event expecting 400, fetches `/terms` and `/privacy`, and reads `docs/test-clock/v<version>.json`; verdicts are `lib/billing/launch.ts`.
Force: judgment — G-128 asks for a checklist; making it a script with exit codes is so it cannot be half-done.
Rejected: an admin page (cannot be exercised live, and would need a session); checks by hand (forgettable).
Consequence: each reconciliation pass writes `BillingRun`; a release launches only with a test-clock record for its commit.
Evidence: lib/billing/launch.ts; scripts/launch-check.mjs; tests/unit/billing-launch.spec.ts; tests/e2e/launch-check.spec.ts