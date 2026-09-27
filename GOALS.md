# Goals — cross-stitch-pattern-generator

Template, numbering, and cross-project conventions live in
`E:\CLAUDE\COMPANY\GOALS.md`. This is a **standalone project** (Owner
decision, 2026-09-09) — not a svc-lab service. Deployed
live at the Owner's direct instruction after M9 (see progress log below)
to `cross-stitch.craftodejnice.cz`; see
`docs/decisions/D013-deployed-to-cross-stitch-craftodejnice.md`, the deploy
log in `HANDOVER.md` and `COMPANY/INFRASTRUCTURE_DEPLOY.md`. Standard
OPERATIONS.md milestone check-in gates apply (not waived, unlike
svc-lab). Completed goals live in `docs/goals-archive.md`.

## Active goals

### G-075 · Accounts: login, a personal cabinet, and admin tools — ACTIVE (2026-09-27)
- **What:** optional user accounts bolted onto the app as it is today — generation and export keep working with no
  account, exactly as now. A visitor can register and log in with email + password; a logged-in reader gets a
  small personal cabinet (email/name, change password, delete account — nothing pattern-related yet, see
  Constraints). An admin role can list and manage users, and see site-wide counts of how many charts have been
  generated and how many exports made, over rolling windows.
- **Why:** Owner request, 2026-09-27. Groundwork for subscriptions and saved patterns — subscriptions are decided
  in *shape* (Stripe, subscription-based tiers unlocking features/limits) but not in *content* (which tiers, which
  limits, not yet chosen), so billing itself stays a separate future goal while this one's schema is shaped not to
  need reworking when that goal starts. It also gives the Owner visibility (usage volume) and control (user
  management) the app has never had. Distinct from G-030 ("a social ecosystem", far-future, intentionally
  unplanned): that goal is about public/community features built *on top of* accounts; this one is the accounts
  themselves, asked for directly and concretely.
- **Acceptance criteria:**
  1. A visitor can register (email + password) and log in / out; a session persists across a reload. Generating a
     chart and exporting it work exactly as today with no account at all — nothing about the anonymous path
     changes or slows down.
  2. A logged-in reader has a personal cabinet page: sees their email and name, can change their name and
     password, and can delete their own account (with a confirmation step).
  3. Passwords are hashed, never logged or stored in the clear; login and registration are rate-limited per
     address.
  4. An admin role exists. One admin account can be established without a chicken-and-egg problem (an
     Owner-configured email is promoted at first sign-in, gated behind a flag the Owner turns off once that
     account exists) and can promote or demote other users.
  5. `/admin/users`: a searchable, paginated list of accounts, with promote/demote-admin and disable-login actions.
  6. An admin page shows counts of generation jobs and export jobs — today / 7 days / 30 days / all time — across
     *all* traffic, logged in or not.
  7. Deployed and verified live the same way every deploy here is (`COMPANY/INFRASTRUCTURE_DEPLOY.md`): a new
     Postgres container for this project, migrations run on deploy, other containers and sites on the host
     unaffected.
- **Constraints:**
  - **Stack: NextAuth (Auth.js) v5 + Prisma + Postgres + bcryptjs.** Requirement, not preference — this is the
    exact stack `listing-studio` and `arfid-meals` already run in production (both on Next 16, same as this
    project), and STANDARDS.md's "minimize spread" rule asks for the established choice unless there's a reason
    not to; there isn't one here. `session: { strategy: "jwt" }` and the admin-bootstrap-by-env-email pattern are
    copied from `listing-studio/src/auth.ts` for the same reason.
  - **This project has never had a database.** Introducing Postgres is a real infrastructure change: one more
    container, one more port to allocate and verify *live* (never from a cached fact, per
    `INFRASTRUCTURE.md`), one more secret (`AUTH_SECRET`). The existing nginx vhost and TLS cert already cover
    `cross-stitch.craftodejnice.cz`, so no new domain or root-owned vhost step is expected — confirm this at
    the deploy milestone rather than assuming it.
  - **The processor does not get a database connection.** Accounts and the stats log belong to the Next.js app
    layer, which already sits in front of the processor for every job; a job-count row is written from the
    existing Route Handlers (`app/api/jobs`, `app/api/exports`), not from inside `processor/`.
  - **The stats write must be best-effort.** A failed or slow write to the usage-event table is never a reason a
    generate or export job fails or waits — judgment, revisit if it ever causes a real problem.
  - **Schema shaped for Stripe subscriptions, not built here.** M1's Prisma schema adds an empty `Tier` table
    (admin-editable rows, not a hardcoded enum — the actual tiers/limits aren't decided yet, and a table means
    changing them later is a data edit, not a deploy) and a `Subscription` model (`userId`, `tierId`, status,
    Stripe customer/subscription ids, current period end) alongside `User`. Nothing reads or writes them, no
    Stripe key, no checkout, no webhook — that is the future billing goal, once the tiers themselves are decided.
    Kept here only so that goal is additive, not a schema rework.
  - **A Stripe webhook will need a seam later that does not exist yet**: `lib/server/request-guard.ts` Origin-checks
    every state-changing request, but a Stripe webhook arrives from Stripe's servers with no Origin header and is
    authenticated by signature instead. Noted for whoever plans the billing goal; nothing to build now.
  - **Password-reset-by-email moves from "maybe never" to "before real money is involved."** Deferred past M1–M5
    like the rest of email delivery (still needs a mail provider only the Owner can provision), but once a paid
    tier exists, a reader who is locked out of a subscription they're paying for is a real support cost, not a
    nice-to-have gap — flag this again when the billing goal is planned rather than letting it stay deferred
    indefinitely.
  - **Deferred, not built here** (judgment, keeps this goal to something one milestone plan can hold): OAuth
    sign-in (email + password only for M1); email verification (same mail-provider dependency as password reset);
    saved patterns and any patterns↔user relationship; the billing goal itself (Stripe checkout, the webhook,
    tier-gating logic in generation/export); a detailed ban workflow (reasons, expiry) — a plain "can this account
    log in" flag is enough for now, matching "simple personal cabinet" in the ask.

**Milestones** (drafted 2026-09-27; not yet confirmed with the Owner):
- [x] M1 — **Accounts foundation**: Postgres in `docker-compose.yml` (dev + the `--profile app` deploy shape),
  Prisma schema (`User`, `Role`, the NextAuth adapter tables, plus the empty `Tier`/`Subscription` scaffolding from
  Constraints), NextAuth wired with the Credentials provider (register, login, logout), `AUTH_SECRET`,
  register/login rate-limited by extending the existing `lib/server/request-guard.ts` token bucket rather than a
  new one. Unit tests on validation/hashing, e2e for the full register → log in → log out loop. No cabinet, admin
  or billing UI yet.
- [x] M2 — **The personal cabinet**: an account page — name and email shown, change name, change password
  (current + new), delete account behind a confirmation. The header/nav shows "Log in" or the account depending
  on session. e2e over the whole loop, including deletion.
- [ ] M3 — **Admin: users**: a role-gated `/admin` layout that redirects a non-admin, the bootstrap-by-env-email
  mechanic, `/admin/users` with search, pagination, promote/demote and disable-login actions. Unit + e2e tests,
  including that a non-admin genuinely cannot reach it.
- [ ] M4 — **Admin: usage stats**: a usage-event table (job kind, optional `userId`, timestamp, no photo or
  personal data) written best-effort from the existing job routes; an admin page with generation/export counts
  over today/7d/30d/all-time. Verified by generating and exporting a known number of times in a real dev run and
  reading the same numbers back on the page.
- [ ] M5 — **Deploy and verify**: allocate and verify a live Postgres port, server-side `.env` secrets
  (`AUTH_SECRET`, `DATABASE_URL`, the admin-bootstrap email/flag), `docker compose --profile app up -d --build`
  with the new `db` + one-shot `migrate` services, live verification (register a real account, confirm it in
  `/admin/users` and that a real generate/export shows up in the stats, confirm anonymous generation is
  unaffected), README + HANDOVER updated, other containers/sites on the host unaffected.

**Progress log** (newest first; The Company appends at every stopping point):
- 2026-09-27 — **M2 reached.** `/account` (`app/account/page.tsx`) re-reads the account from Prisma on every
  request rather than trusting the JWT session (D246), and holds three sections: Profile (`NameForm`, rename),
  Password (`PasswordForm`, current+new with the current password checked against the real hash before
  anything changes), Danger zone (`DeleteAccount`, a two-step reveal that requires typing the account's own
  email — no native `confirm()`, matching this app's own rule for irreversible actions). Its own "Log out"
  button was added (the page had none at first — a personal cabinet needing a detour through `/login` to sign
  out was a real gap, not a deferred nice-to-have). `AccountBadge` (`app/components/auth/account-badge.tsx`) is
  a fixed corner pill on the canvas app naming the signed-in reader (or "Log in") and linking to `/account`,
  chosen over the top bar to avoid D213's sideways-scroll hazard. `lib/auth/account-actions.ts` holds the three
  server actions, each reading the signed-in id from `auth()`, never a form-carried id. Verified:
  `tests/e2e/accounts.spec.ts` now 7 cases (6 from M1, updated for register/login now landing on `/account`
  rather than `/`, plus one new case driving the whole M2 loop: rename → wrong-then-right password change →
  login with each password → wrong-then-right delete confirmation → login after deletion fails) against a real
  Postgres container through the production build/start pipeline; 817 unit tests; lint/tsc/prettier/docs-lint
  clean. A first pass reported two suspicious results (a wrong-password attempt showing no error, a
  correct-password change showing no success) — traced to the dev server used for manual verification having
  gotten into a stuck state after many hot-reloads across earlier probes (no network request was even sent on
  click), not a real bug: a clean server restart plus a corrected probe confirmed the actual behavior is
  correct, and the same behavior is what the new e2e case now pins. Next: M3, admin user management.
- 2026-09-27 — **M1 reached.** Postgres added to `docker-compose.yml` (un-profiled `db` + one-shot `migrate`
  under the `app` profile, D244); `prisma/schema.prisma` covers `User`/`Role` plus the NextAuth adapter tables
  and the `Tier`/`Subscription`/`UsageEvent` scaffolding from Constraints, one migration for the whole goal.
  NextAuth v5 (Credentials, JWT sessions, admin-bootstrap-by-`ADMIN_EMAIL`) in `auth.ts`; register/login/logout
  as server actions (D245) in `lib/auth/actions.ts`, validated by `lib/auth/validation.ts`, rate-limited by a
  new `auth` kind on the existing job limiter (`lib/server/request-guard.ts`, 8/15min, its own bucket so a
  generation burst never costs a login attempt). `/login` and `/register` pages; visiting `/login` while
  already signed in shows the account and a real logout button, since there is no cabinet yet to put one in
  (M2). Verified: `tests/e2e/accounts.spec.ts` (6 cases: register-signs-in-and-survives-reload, logout, log
  back in, wrong password, duplicate email, field validation) against a real Postgres container through the
  production build/start path every e2e spec shares; 3 new unit tests on the `auth` rate-limit bucket (20 total
  in that file); 817 unit tests; a 20-spec cross-section (accounts + generation + navigation, 3 workers) to
  confirm the shared webServer change doesn't regress unrelated specs, rather than the full ~440-spec suite (a
  first full run was started pointed at a not-yet-built Rust binary and stopped rather than trusted). Found and
  fixed live: `npm install -D prisma` alone resolves an 8.x release candidate while `@prisma/client` stays on
  7.x (npm's `latest` dist-tag), pinned explicitly; a `role="alert"` on the error banner collided with Next's
  own route-announcer div in Playwright's strict mode, given its own `data-testid`; `<input type="email">`'s
  native validation was intercepting the field-validation test before the server action ran, so both forms
  gained `noValidate` and rely on the server-rendered field errors instead. Also found and corrected in
  HANDOVER, unrelated to G-075: "Current state" had drifted to a commit two deploys behind the real one, and a
  "Rules in force" line named an env var G-074 M4 had already removed. Lint/tsc/prettier/docs-lint clean.
  Rules in force was over its 160-line cap after M1's additions; six drawn-dither-pattern rules moved to
  `docs/reviews/2026-09-27-drawn-pattern-rules.md`, replaced by one pointer line. Next: M2, the personal
  cabinet.
- 2026-09-27 — Owner: "go ahead through all milestones." worktree:
  `E:\CLAUDE\worktrees\cross-stitch-pattern-generator--G-075` (branch `goal/G-075`). Starting M1.
- 2026-09-27 — Owner confirmed billing direction: Stripe, subscription-based tiers unlocking features/limits
  (which tiers/limits not yet decided). M1's schema now includes empty `Tier`/`Subscription` scaffolding so the
  future billing goal is additive rather than a rework; the webhook's Origin-check seam and the
  password-reset-before-paid-tiers point are noted in Constraints for that goal. No milestone content otherwise
  changed — the login system's own mechanics (Credentials, sessions, rate limiting) are unaffected by the billing
  model chosen.
- 2026-09-27 — goal drafted at the Owner's request: milestone plan above, not yet started. Researched the
  portfolio before choosing a stack rather than picking one blind — read `listing-studio`'s `auth.ts`, Prisma
  schema (`User`/`Generation`/`EventLog` shapes), admin layout and users page, and its mail-transport fallback
  (`file | smtp | resend`, degrading to a local outbox with no provider configured) as the pattern M1/M4 will
  reuse. Awaiting Owner confirmation of the milestone plan before M1 starts (OPERATIONS.md §2).

### G-069 · The workspace stops being the only thing that knows how everything connects — DRAFT (2026-09-24)
- **What:** the changes `docs/reviews/2026-09-24-workspace-shape.md` recommends: a `useEditorDocument` hook owning
  what it means to replace the open chart, then grouped props for the panes that take 31 and 30 of them.
- **Why:** `app/workspace.tsx` is 754 lines of which 465 are logic and 289 are wiring, and not one of its 19
  functions is longer than 18 lines. It is not complex, it is wide — and the eight functions that replace a chart
  each have to remember the same list of state to reset. That is the shape of mistake that produced D217.
- **Acceptance criteria:** replacing the open chart is decided in one place; adding a tool touches one hook and one
  component; no behaviour change, suites green.
- **Constraints:** not a line-count exercise. G-067's "under 300 lines" was a bad proxy and is not inherited; a shell
  component taking 38 props would meet it and improve nothing.

### G-030 · Public launch: a social ecosystem around the app — DRAFT, far future (2026-09-12)
- **What:** Eventually make the app public, built around **a social
  ecosystem** (community/sharing features -- exact shape not yet defined:
  could include public pattern galleries, profiles, following, comments,
  or similar) rather than a plain paywall-on-exports model. Owner
  explicitly corrected an earlier draft of this goal that jumped straight
  to a detailed "server-side generation + paid export tiers" plan --
  **that plan is withdrawn**, not just superseded; the real direction is
  the social ecosystem, and "other details will be defined later"
  (Owner's own words, 2026-09-12).
- **Why:** Owner is exploring making the app public and building a
  business around it, but this is explicitly **a plan for very later**,
  not something to scope or sequence now.
- **Status:** Intentionally not planned in detail -- no acceptance
  criteria, no milestones, per the Owner's own "very later, details
  defined later" framing. This entry exists so the intent isn't lost
  between sessions, not to commit to any architecture yet. Do not expand
  this into a full plan without an explicit Owner go-ahead to start
  planning it for real.
- **One durable technical fact worth keeping regardless of eventual
  shape** (verified while a fuller version of this goal was briefly
  drafted, then withdrawn): `buildPattern` (`lib/pattern.ts`) and
  everything it calls already take/return plain typed-array buffers with
  zero DOM dependency (`lib/pattern.worker.ts` is just a thin
  `postMessage` shim around it) -- so if a future version of this goal
  ever does need server-side generation, the existing TypeScript pipeline
  can run in a Node server context unmodified, without needing G-023's
  Rust work first. Not a decision, just a fact worth not re-deriving
  later.
