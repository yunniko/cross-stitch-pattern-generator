# D221 · The sidecar is the only engine; the TypeScript pipeline stops shipping
Date: 2026-09-24 · Goal: G-068 M2 · Status: active (superseded by: —)
Context: D190 and D193 kept TypeScript behind the sidecar as a fallback, so a missing binary cost speed rather than a job. The price: every pipeline feature written twice and proved byte-identical, while CI verified the fallback and production ran the port (G-067 A1).
Decision: the processor runs `cs-job` and nothing else. A missing or failing binary throws naming it; `CS_JOB=0` is gone, and the worker no longer imports the TypeScript pipeline or export path.
Force: requirement — the Owner's decision of 2026-09-24. The TypeScript was the specification the port was written against during the transfer, not a second engine, and new features do not owe it a mirror.
Rejected: keeping the fallback for bad builds — a build that cannot generate is a deploy to roll back, not a slower path to take silently.
Consequence: the golden hashes are the regression floor, checked against the binary by `npm run test:goldens:rust`. The e2e suite runs only in the CI job holding it. Reverses the fallback clause of D190 and D193.
Evidence: processor/pool-worker.ts; processor/rust-jobs.ts; scripts/rust-goldens.ts
