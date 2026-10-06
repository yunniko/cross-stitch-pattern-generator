# D305 · The admin's actions take a feature id by its shape, and every change is logged
Date: 2026-10-06 · Goal: G-102 M3 · Status: active (superseded by: —)
Context: the admin pages write the states, but the feature list lives with the tools' client modules, closed to a server action.
Decision: `lib/admin/feature-actions.ts` checks an id for shape only (`isFeatureIdShape`; lowercase alone refused camelCase ids until 2026-10-06) and a state for being one of four; the list on the page is the client's. Every action writes a `FeatureChange` row (scope, subject, what is now true, who, when), shown newest first. For the site, "on" removes the row; for a person or a set it is kept, since it lifts a lock.
Force: judgment — an id for a feature that does not exist is harmless (the resolver matches nothing by it); a server-side copy of the list would be a second list to keep in step.
Rejected: a build-time list of ids (a file to forget); a log without the admin's email.
Consequence: the log is append-only; the page shows thirty. Tiers are made here with a name only, until a billing goal gives them more.
Evidence: tests/e2e/admin-features.spec.ts
