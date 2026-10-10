# D406 · A deleted account's usage stays in the totals, untied from it; Active accounts counts existing accounts
Date: 2026-10-10 · Goal: G-133 M4 · Status: active (superseded by: —)
Context: the Overview read 4 active accounts with 3 accounts: `UsageEvent.userId` is a plain column, so a deleted account's id stayed on its events.
Decision: deleting an account clears `userId` on its events in the same transaction; a migration clears ids whose account is gone; Active accounts joins `User`.
Force: judgment — the generations and exports happened, so the site's totals keep them; the deleted person's activity need not stay tied to their id.
Rejected: deleting the events with the account (the site's past totals would shrink); a foreign key with `SET NULL` (a schema change on the busiest table, for what one statement does).
Consequence: any new place that deletes an account must clear its usage ids too; the count's join keeps the figure right regardless.
Evidence: tests/e2e/admin-stats.spec.ts; prisma/migrations/20261010110000_untie_deleted_accounts_usage/migration.sql