# D344 · An address must be confirmed only while sending is on

Date: 2026-10-07 · Goal: G-113 M2 · Status: active (superseded by: —)
Context: accounts need a confirmed address, but production runs with sending off until the Owner picks a domain, and an account that can never be confirmed must still be usable.
Decision: one rule, `mustConfirmAddress(account, mailOn())` in `lib/auth/confirmation.ts`, refuses sign-in (and ends an existing session at the account recheck) only when sending is on and the address is unconfirmed; while sending is on, registering answers "check your email" whether or not the address already had an account, and the mailbox is told which.
Force: requirement — Owner, 2026-10-07: no domain yet, no users, build it now with sending off.
Rejected: confirming every account regardless (locks everyone out while sending is off); a separate "confirmed" flag (Auth.js's `emailVerified` already is one).
Consequence: switching sending on makes every unconfirmed account confirm before its next sign-in. The e2e suite runs with sending on, so the off path is covered by unit tests and the live check only.
Evidence: tests/unit/auth-confirmation.spec.ts; tests/e2e/email-confirmation.spec.ts
