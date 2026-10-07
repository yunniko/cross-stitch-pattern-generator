# D335 · A session rechecks its account every five minutes; admin rights are read from the database
Date: 2026-10-07 · Goal: G-117 M1 · Status: active (superseded by: —)
Context: sessions are JWTs (D244), so disabling or demoting an account changed nothing for a session already signed in, for up to 30 days.
Decision: the `jwt` callback re-reads `role` and `disabled` when its `checkedAt` is over five minutes old and ends the session for a missing or disabled account; sessions last 7 days; every admin page and action goes through `lib/admin/require-admin.ts`, which reads the role from the database.
Force: requirement — Owner, 2026-10-07: "fix issues" from the security review kept outside this repository.
Rejected: database sessions (a query on every request, and a migration of every signed-in user); checking on every request in the callback (the same cost for no gain beyond five minutes).
Consequence: an admin check never trusts `session.user.role` alone; a sign-in also takes as long when the email has no account.
Evidence: auth.ts; lib/admin/require-admin.ts; app/admin/layout.tsx
