# D409 · The admin bootstrap is off unless set, and closes once an admin exists
Date: 2026-10-11 · Goal: G-134 M1 · Status: active (superseded by: —)
Context: the bootstrap that promotes `ADMIN_EMAIL` at sign-in was on unless `ADMIN_BOOTSTRAP_ENABLED` read "false", and compose defaulted it to on. Production had it off, so the risk was a forgotten variable on a new host.
Decision: it runs only when the variable is exactly "true" and no admin account exists.
Force: judgment — the default was fail-open where an open bootstrap lets anyone registering that address become an admin; nothing outside compels the exact form.
Rejected: removing the bootstrap (a fresh database would have no way to get its first admin).
Consequence: a new deployment sets the variable to "true" once, for its first admin. It can be left on afterwards without effect.
Evidence: auth.ts; docker-compose.yml; docs/reviews/2026-10-10-code-health-review.md
