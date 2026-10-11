# D407 · The processor spawns and kills every cs-job itself; photos are header-checked before decoding
Date: 2026-10-11 · Goal: G-134 M1 · Status: active (superseded by: —)
Context: a cancelled or overrunning job ended its worker thread while its `cs-job` child kept running, past the three-slot cap (D149). Predictions and previews had no deadline. The pixel cap ran only after the full decode, and an SVG upload crashed the process.
Decision: the main thread spawns each job as one `cs-job` process under the pool's three slots, with a deadline, an abort that kills it, and a slot freed only when it exits. Every photo's format and size are read from its header before decoding.
Force: requirement — the Owner accepted G-134 (2026-10-11), and the orphaned child and the decode-first cap were reproduced (review A1, A3).
Rejected: keeping the worker threads and killing the child from inside them (four serialisations of a pattern buy nothing once the work is in Rust); trusting the decoder to refuse big images (it allocates first).
Consequence: any new child the processor spawns goes through `runCsJob` with a deadline. Stderr that is not the sidecar's JSON note is logged, never shown.
Evidence: tests/unit/processor-job-kill.spec.ts; tests/unit/image-header.spec.ts; docs/reviews/2026-10-10-code-health-review.md
