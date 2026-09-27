# D246 · The corner badge's name goes stale until the next login
Date: 2026-09-27 · Goal: G-075 M2 · Status: active (superseded by: —)
Context: `AccountBadge` reads the display name from the JWT session, rewritten only at sign-in (D244).
Renaming on `/account` updates Prisma but not the session cookie, so the badge shows the old name until
the reader logs in again.
Decision: accept the staleness for M2 rather than adding session-refresh plumbing.
Force: judgment — nothing requires the badge to be live; `/account` itself always reads Prisma fresh.
Rejected: re-reading Prisma in the `jwt` callback on every request (a DB round trip per page view for a
cosmetic label); calling NextAuth's `update()` from `NameForm` (real fix, deferred as small enough to add
later without touching the schema).
Consequence: a future fix calls `update()` from `NameForm` on success, not the `jwt` callback.
Evidence: tests/e2e/accounts.spec.ts ("the personal cabinet..." checks the badge before rename, not after).
