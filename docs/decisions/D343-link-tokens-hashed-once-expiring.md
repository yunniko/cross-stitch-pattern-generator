# D343 · A link's token is random, stored as its SHA-256, bound to a purpose and an account, used once, and expires
Date: 2026-10-07 · Goal: G-113 M1 · Status: active (superseded by: —)
Context: confirming an address and setting a new password are both done through a link sent by mail.
Decision: 32 random bytes in the link; `VerificationToken` keeps their SHA-256 under `purpose:userId`; using one deletes it, issuing one deletes the account's earlier ones of that purpose; a confirmation lasts 48 hours, a reset one hour.
Force: requirement — the goal's acceptance ("a link works once and expires"); hashing so a copy of the table opens no account.
Rejected: bcrypt for the hash (the token is not a guessable password, and lookup must be by hash); a signed token with no row (it could not be used only once).
Consequence: the rule is `lib/auth/tokens.ts`, the storage `lib/auth/token-store.ts`; a new purpose is an entry in `TOKEN_PURPOSES`.
Evidence: tests/unit/auth-tokens.spec.ts; lib/auth/token-store.ts
