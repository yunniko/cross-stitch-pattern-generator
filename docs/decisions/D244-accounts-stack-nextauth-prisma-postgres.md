# D244 · Accounts run on NextAuth v5 + Prisma + Postgres + bcryptjs
Date: 2026-09-27 · Goal: G-075 M1 · Status: active (superseded by: —)
Context: this project has never had a database or accounts. `listing-studio` and `arfid-meals` already run accounts in production, on the same Next 16 this project uses.
Decision: the same stack, in the same shape — `session: { strategy: "jwt" }`, a Credentials provider, the admin-bootstrap-by-`ADMIN_EMAIL` mechanic, one Postgres container per `INFRASTRUCTURE_DEPLOY.md`'s pattern (`db` + one-shot `migrate` + `app`).
Force: requirement — STANDARDS.md's minimize-spread rule: two projects already solve this exact problem in production, and nothing about this app's needs differs.
Rejected: a different auth library (Lucia, a hand-rolled session store) — nothing here needed one, and it would be the third pattern for the same job; rolling passwords/sessions by hand — bcryptjs and NextAuth's cookie handling are the established, audited pieces of that.
Consequence: `prisma/schema.prisma`'s `User`/`Account`/`Session`/`VerificationToken` shape is the adapter's, not a free choice; changing it later means following the adapter's migration path, not this project's own judgment.
Evidence: auth.ts; prisma/schema.prisma; tests/e2e/accounts.spec.ts
