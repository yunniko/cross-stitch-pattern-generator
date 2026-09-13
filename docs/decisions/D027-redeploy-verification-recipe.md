# D027 · A redeploy is verified by container isolation, neighbor sites and the original repro on the live URL
Date: 2026-09-10 · Goal: G-010 · Status: active (superseded by: —)
Context: G-010's fixes were deployed after Owner sign-off to a host shared with unrelated sites.
Decision: Redeploy with git fetch, git pull and docker compose up --build from the project directory. Verify that only this container restarted, that neighbor sites still return 200, and that the fixed bug's original reproduction passes on the production URL with no console errors.
Rejected: a health-check ping alone (doesn't prove the fix shipped or that neighbors are unaffected); a combined git pull (documented hang risk).
Consequence: Every deploy adds a row to the handover's deploy log with its commit and verification.
Evidence: COMPANY/INFRASTRUCTURE_DEPLOY.md; HANDOVER.md D27 as of commit f7bb51c (deployed 10b0a95).
