# D337 · The database publishes a host port only in `docker-compose.dev.yml`; production's password comes from `.env`
Date: 2026-10-07 · Goal: G-117 M2 · Status: active (superseded by: —)
Context: `db` published 127.0.0.1:54324 in production too, on a host other sites share, with the password committed in `docker-compose.yml`.
Decision: `docker-compose.yml` publishes no `db` port and reads `DB_PASSWORD` (default `cross_stitch`, for local and CI only); `docker-compose.dev.yml` adds the port for `npm run dev` and the e2e suite.
Force: requirement — Owner, 2026-10-07: "fix issues" from the security review kept outside this repository.
Rejected: keeping the port behind a stronger password only (any account on the host could still reach it); a Docker secret file (one more file to keep outside git, for the same effect).
Consequence: Postgres reads its password only when it first creates its data, so changing `DB_PASSWORD` later also needs `ALTER USER` in the container.
Evidence: docker-compose.yml; docker-compose.dev.yml; scripts/playwright-servers.ts
