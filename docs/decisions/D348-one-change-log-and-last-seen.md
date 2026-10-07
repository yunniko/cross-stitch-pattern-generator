# D348 · Every admin change goes into one change log, and last seen is kept at the account recheck

Date: 2026-10-07 · Goal: G-107 M3 · Status: active (superseded by: —)
Context: The redesigned admin shows a Change log of everything admins changed and, per person, when they were last seen; role and login changes were not logged, and nothing recorded activity.
Decision: `FeatureChange` holds every admin change, with roles and logins under scope `ACCOUNT` and the page grouping scopes as Users, Features or Tiers; `User.lastSeenAt` is written only at sign-in and at each passed account recheck.
Force: judgment — one table already carried who, when and what; the recheck already reads the account, so last seen costs one write per five minutes per person and is exactly that fine.
Rejected: a separate account-audit table (two logs to read for one question); a write on every request (load for precision nobody needs).
Consequence: a new kind of admin change calls `logChange` (`lib/admin/change-log-data.ts`) and joins a group in `lib/admin/change-log.ts`; last seen is null for people not seen since this shipped.
Evidence: tests/unit/admin-panel.spec.ts; tests/e2e/admin-sections.spec.ts; prisma/migrations/20261007194050_admin_last_seen_and_change_scope/migration.sql
