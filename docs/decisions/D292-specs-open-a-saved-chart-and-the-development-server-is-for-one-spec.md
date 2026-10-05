# D292 · Specs open a saved chart; the development server is for one spec at a time
Date: 2026-10-05 · Goal: G-096 · Status: active (superseded by: —)
Context: the browser suite asked the server for 245 generations a run, so a live check tripped the site's limit of six jobs a minute after three cases; and every browser check waited for a production build.
Decision: a spec that is not about generation opens `tests/e2e/fixtures/sample_editable.json` (`openSmallChart`). `scripts/playwright.live-free.config.ts` runs against the live site the specs that neither generate, export through the server nor sign in. `npm run e2e:dev` serves one spec at a time while working; a build remains what anything is verified on.
Force: judgment — the measurements in the guide.
Rejected: a way round the limit on the live site (a test affordance in production); the development server for the suite (776 s and 5 failures against 260 s and none); more workers (slower); scoping the lint rule (4 s of 29).
Consequence: a new spec uses `openSmallChart` unless generation is its subject; the fixture is made again when generation changes on purpose; a spec that starts generating or exporting leaves the live list.
Evidence: docs/development-loop.md; scripts/playwright.live-free.config.ts; tests/e2e/helpers/app.ts
