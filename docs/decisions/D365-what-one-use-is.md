# D365 · What one use is: a generation or try, or one server export; guests are refused, never counted
Date: 2026-10-08 · Goal: G-109 M1 · Status: active (superseded by: —)
Context: the counted limits need a unit, and the Owner ruled that nothing is stored about a guest.
Decision: one accepted `/api/jobs` request (each try) is a generation and one accepted `/api/exports` request (Export all included) is an export, over rolling 24 hours and 30 days; files made in the browser are not counted; a guest is refused whenever a limit on the action is in force.
Force: requirement — Owner, 2026-10-06 (generation and export; guests need an account) and 2026-10-08 (rolling periods; unset limits do not apply).
Rejected: counting a guest by address (stores something about a guest); counting browser-made files (a limit the server cannot enforce).
Consequence: a new server action joins by an entry with `counted` in `ACCOUNT_LIMITS` and a call to `takeQuota` in its route.
Evidence: lib/limits/limits.ts; tests/unit/quota.spec.ts
