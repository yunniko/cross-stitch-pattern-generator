# D345 · A password reset ends every session signed in before it

Date: 2026-10-07 · Goal: G-113 M3 · Status: active (superseded by: —)
Context: a reset is what someone does when a password may be known to another person, and JWT sessions cannot be revoked one by one.
Decision: setting a password through a reset link stamps `User.sessionsValidFrom`; each session records when it signed in, and the account recheck (D335) ends one signed in earlier (`lib/auth/session-rule.ts`). The link page only checks the token; sending the new password spends it, and confirms an unconfirmed address.
Force: judgment — a reset that leaves the other person signed in protects nothing; the recheck interval bounds how late it takes effect.
Rejected: database sessions (every request reads the database, against D335's design); a per-account token version bumped on every password change (the cabinet's change would then sign its own reader out).
Consequence: other sessions end within the recheck interval (five minutes; `ACCOUNT_RECHECK_SECONDS`, 0 in e2e). A password changed from the account page does not end other sessions.
Evidence: tests/unit/auth-session-rule.spec.ts; tests/e2e/password-reset.spec.ts
