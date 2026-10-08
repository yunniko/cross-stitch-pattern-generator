# D371 · The reconciliation is the app's own route, called by a clock service on the compose network
Date: 2026-10-08 · Goal: G-106 M2 · Status: active (superseded by: —)
Context: dropped webhook events must be recovered by a scheduled pass, as a service of this project's compose file, needing no root.
Decision: `POST /api/billing/reconcile` runs the pass with the webhook's write path; a `billing-reconcile` service (`node:22-alpine`, a mounted script) calls it every 60 minutes with a shared token, and the route refuses any request that came through nginx.
Force: judgment — STANDARDS "verified means the path production runs": a separate script would be a second implementation of the write path.
Rejected: a host cron job (root, and outside the project); a second image carrying the TypeScript sources (a second build to keep in step).
Consequence: production's container count grows by one; `BILLING_RECONCILE_TOKEN` is set in `.env` before billing is switched on.
Evidence: app/api/billing/reconcile/route.ts; lib/billing/reconcile-access.ts; scripts/billing-reconcile-loop.mjs; docker-compose.yml