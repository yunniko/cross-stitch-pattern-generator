# D100 · Playwright runs against `next build && next start` on its own port
Date: 2026-09-13 · Goal: G-031 M1 (pulled forward from M5) · Status: active (superseded by: —)
Context: the e2e web server was `next dev -p 30200`; Next 16 allows one dev server per directory, so any running dev server (the review found one left by another session) made the whole suite unable to start (review P3).
Decision: `playwright.config.ts` builds and starts a production server on port 30200, reuses an already-running one locally (`reuseExistingServer: !process.env.CI`) so iteration doesn't rebuild each time, and never reuses in CI. The 1440×900 viewport stays (the docked desktop layout is flaky at 1280×720).
Rejected: keeping `next dev` with a different directory — a second checkout per test run is heavier than a build; skipping the build when `.next` exists — stale builds silently test old code.
Consequence: a first e2e run pays a ~1 minute build; keep `npm run start -- -p 30200` running while iterating on e2e tests. The build must succeed before e2e can run, so `tsc`/lint problems surface there too.
Evidence: playwright.config.ts; the 2026-09-13 G-031 M1 e2e run logged in GOALS.md.
