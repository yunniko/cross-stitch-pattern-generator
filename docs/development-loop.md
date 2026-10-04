# The development loop (G-090 M4)

How a change is checked, and how long each step takes. Measured 2026-10-04 on the Owner's machine at commit 61a116a.

## Which lane

| The change… | Lane |
|---|---|
| touches only the interface: no chart data or file format, no export, no generation, nothing in `processor/`, `rust/` or the account code | **Fast lane** (D280) |
| anything else, or any doubt | **Normal goal**: milestones, full suite, deploy, handover |

## Fast lane, step by step

1. Make the change. Logic goes in `lib/` with a unit test; see `docs/architecture.md` for where.
2. `npm run check:fast` — type-check, the unit tests related to the changed files, lint with its cache. **42 s** measured.
3. If the interface changed: `npm run e2e:servers` once (it builds and starts the app and processor the way the suite expects;
   leave it running, rebuild with it after a change), then run only the specs the change can affect, for example
   `npx playwright test tests/e2e/crop-tool.spec.ts`. **10 s** for that file; the rebuild is **35 s**.
4. Commit with one line under "Small changes" in `GOALS.md`.
5. **Batch deploy**, once per batch or day: `npm run test:e2e` (the whole suite, **4 min 25 s**), deploy, the affected specs
   against the live site, one deploy-log row listing what the batch carried, and the design brief and handover updated once.

## Measured

| Step | Time | Note |
|---|---|---|
| Type-check | 21 s | |
| Unit tests, all 1,000 | 22 s | |
| Unit tests related to the change (`vitest run --changed`) | 4 s | |
| Lint, cold | 22 s | The 70 s first reported in the growth-readiness review was measured while other work was running and was wrong; the guess that generated folders caused it was also wrong. One rule (`react-hooks/static-components`) is 79 % of the time |
| Lint, cached (`eslint --cache`, now the `lint` script) | 6.5 s | |
| Production build | 35 s | |
| One spec file | 10 s | |
| Whole browser suite, 533 cases | 4 min 25 s | 531 in parallel, then the 2 site-counter cases alone |

**A small interface change, machine time:** before, everything every time: 21 + 22 + 22 + 35 + 265 s ≈ **6 min**, plus a
deploy and live check per change. Fast lane: 42 + 35 + 10 s ≈ **1.5 min**, with the 4.5 min suite and the deploy paid once per
batch.

## What was fixed in the tooling (no app behaviour changed)

- **The two always-failing cases.** The admin statistics specs read site-wide counters, so any spec generating at the same
  moment moved them: they failed in every parallel run and passed alone. They are tagged `@alone`, and `npm run test:e2e` runs
  them after the rest, one at a time. The full suite now ends with 0 failed (533 passed, verified once).
- **Lint cache** on by default.
- **`npm run e2e:servers`**: one command instead of a hand-typed environment; it also picks up the Rust binary from the build
  tree.
- **`npm run check:fast`**.

## Still open (scoped, not done)

| Item | What it needs | Size |
|---|---|---|
| The suite's database cannot be started by Playwright on this machine: an old worktree's container (`cross-stitch-pattern-generator--g-075-db-1`) holds port 54324, so the configured start fails and the servers must be started first | The Owner's go-ahead to remove that container and let the project's own one take the port (it holds only test data) | Minutes |
| Live checks trip the site's limit of 6 generations a minute | Specs that do not test generation open a saved chart instead of generating (46 of 63 spec files generate today); no back door on the live site | A day; also speeds the local suite |
| Browser tests need a production build | Try the suite against the development server for the fast lane only (D102 chose the build for stability); measure before adopting | Half a day |
| Tool behaviour is tested only through the browser | Comes with the tool registry (architecture step 2): tools as modules are unit-testable | Part of that goal |
| The slow lint rule | See whether `react-hooks/static-components` can be scoped; 17 of 22 s | An hour |

## QA

An exploratory pass (`/qa-review`) runs at each goal's last milestone (Owner, 2026-10-04), scoped to what the goal changed;
its report goes to `docs/qa-review/` and its findings to a triage table for the Owner. It is not a gate on fast-lane changes.
A full pass is run before a public launch and after each architecture step.
