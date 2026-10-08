# D364 · A counted limit is checked and counted in one locked transaction, and given back if the processor refuses
Date: 2026-10-08 · Goal: G-109 M1 · Status: active (superseded by: —)
Context: a quota must not let two requests at once both take the last use, and `recordUsage` (D247) counts after acceptance without being awaited.
Decision: `takeQuota` (`lib/limits/quota-server.ts`) reads the uses from `UsageEvent` under `pg_advisory_xact_lock` per person and action, decides with the pure `decideQuota`, and writes the use in the same transaction; a job the processor does not accept deletes it again.
Force: requirement — the acceptance's "refused by the server, counts survive a restart and are shared by every instance", which rules out memory and an unlocked check.
Rejected: a counter row per person and period (rolling periods need the times, not a sum); a serializable transaction (retries on conflict instead of waiting).
Consequence: an action with every limit unlimited takes no lock and keeps `recordUsage` as it was; a new limited route settles its ticket on every path.
Evidence: tests/unit/quota.spec.ts; prisma/migrations/20261008230000_usage_quota_index/migration.sql
