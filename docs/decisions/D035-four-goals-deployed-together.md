# D035 · G-013 to G-016 shipped in one redeploy without the planned DMC e2e coverage
Date: 2026-09-11 · Goal: G-013, G-014, G-015, G-016 · Status: active (superseded by: —)
Context: Four implemented and unit-tested goals were uncommitted when the Owner asked to deploy.
Decision: Commit one goal per commit (73904de, a4d92f0, 5c6e510, eef7c1a) and deploy together with the D027 recipe. Verify on production the cm default, the 100-color slider and a real DMC name.
Rejected: holding the deploy for DMC e2e tests (the Owner's instruction was direct); treating the deploy as sign-off that e2e coverage is unnecessary.
Consequence: The missing DMC e2e coverage stayed open until G-031 M5 added brand and Crisp generation tests.
Evidence: tests/e2e/palette-modes.spec.ts; HANDOVER.md D35 as of commit f7bb51c.
