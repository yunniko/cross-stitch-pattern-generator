# D334 · Every password check is limited inside `authorize()`, per address and per account
Date: 2026-10-07 · Goal: G-117 M1 · Status: active (superseded by: —)
Context: the sign-in limit lived in the login form's server action, while Auth.js also takes credentials on its own route; and the client address was read from a header the client can write.
Decision: `authorize()` spends `signInRateLimited(address, email)` (8 per address, 20 per account, per 15 minutes) before any password check, and `clientIp()` reads `x-real-ip`, else the last `x-forwarded-for` entry — the ones nginx writes.
Force: requirement — Owner, 2026-10-07: "fix issues" from the security review kept outside this repository.
Rejected: blocking Auth.js's callback route (a later Auth.js release could add another path in); per-address only (a guesser with many addresses meets no limit).
Consequence: any new way to check a password goes through `authorize()`; the account bucket is larger than the address one so one address cannot lock someone out.
Evidence: tests/unit/request-guard.spec.ts; auth.ts; lib/server/request-guard.ts
