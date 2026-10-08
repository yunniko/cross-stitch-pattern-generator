# D374 · Site-wide settings are a registry in code and one row each in `SiteSetting`
Date: 2026-10-08 · Goal: G-126 M1 · Status: active (superseded by: —)
Context: the grace after a failed renewal is the admin's to set (Owner's G-126 acceptance), and the site had no place for a single site-wide number.
Decision: `SITE_SETTINGS` in `lib/settings/site-settings.ts` defines each setting (label, unit, default, range); `SiteSetting` stores one row per setting the admin changed; a missing or invalid row takes the default; it is read uncached per request.
Force: judgment — a setting has no layers, so the limits' tier and person layering would be machinery without use.
Rejected: an environment variable (needs a redeploy, not the admin's); reusing the limits tables (layers that mean nothing for a site-wide value).
Consequence: a new site-wide number is one registry entry; the admin form (G-126 M2) lists the registry, not a hand-made field.
Evidence: lib/settings/site-settings.ts; lib/settings/server.ts; tests/unit/site-settings.spec.ts; prisma/migrations/20261009000000_site_settings/migration.sql
