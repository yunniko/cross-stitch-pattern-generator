# D029 · Rendering deploys re-check the small-chart header clip on production
Date: 2026-09-10 · Goal: G-012 · Status: active (superseded by: —)
Context: G-012 replaced the whole app shell, including the rendering paths behind review finding 5 (header clipping).
Decision: Deploy with the D027 recipe, then on the live URL generate a Custom size 10 pattern and confirm the downloaded PNG is wider than the old clipped width (292 px).
Rejected: relying on the e2e suite alone (it runs against a local build, not the deployed artifact).
Consequence: Any deploy touching rendering repeats this production check. The same bound is asserted in tests/e2e/generate-pattern.spec.ts.
Evidence: tests/e2e/generate-pattern.spec.ts; HANDOVER.md D29 as of commit f7bb51c (deployed aadfec5).
