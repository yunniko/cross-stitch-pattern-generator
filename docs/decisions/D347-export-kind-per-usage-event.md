# D347 · Each export's usage event records the kind that was exported

Date: 2026-10-07 · Goal: G-107 M2 · Status: active (superseded by: —)
Context: Usage on the account lists exports by kind, and the events said only that an export happened.
Decision: `UsageEvent` gains a nullable `exportKind`, written by the exports route from the request's kind only after the processor accepted it; earlier events stay null and show as "Kind not recorded".
Force: judgment — the kind is known at the one place the event is written, and a column is cheaper to read than a second table.
Rejected: a separate export-log table (a second write for the same fact); guessing old events' kinds (nothing records them).
Consequence: names come from the Export workspace's own groups (`lib/account/usage.ts`), so a new export kind is named there once; an index on `(userId, createdAt)` serves the 30-day read.
Evidence: tests/unit/account-usage.spec.ts; tests/e2e/account-sections.spec.ts; prisma/migrations/20261007192549_usage_export_kind/migration.sql
