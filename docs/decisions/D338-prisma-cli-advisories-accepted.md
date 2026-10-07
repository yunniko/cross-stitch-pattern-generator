# D338 · The Prisma CLI's remaining dev-dependency advisories are accepted rather than downgrading to Prisma 6
Date: 2026-10-07 · Goal: G-117 M2 · Status: active (superseded by: —)
Context: after `next` 16.3.8 and `npm audit fix`, `npm audit --omit=dev` reports nothing; the full audit still lists advisories in packages the `prisma` CLI bundles (`mysql2`, `deepmerge-ts`).
Decision: keep Prisma 7.x and accept them until a Prisma 7 release clears them.
Force: judgment — the only offered fix is `npm audit fix --force`, which installs Prisma 6, a major downgrade of the client this app is built on; the CLI runs only at build and migration time, against this project's own Postgres, never MySQL.
Rejected: Prisma 6 (breaking downgrade); overriding the nested versions (untested combinations inside the CLI).
Consequence: re-run `npm audit` at each Prisma upgrade; never `npm audit fix --force`.
Evidence: package.json; package-lock.json
