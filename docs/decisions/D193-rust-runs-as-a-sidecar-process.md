# D193 · Rust runs as a sidecar process, not a native addon
Date: 2026-09-20 · Goal: G-048 M6 · Status: active (superseded by: —)
Context: D190 ships Rust in the processor. M6 planned a napi-rs addon loaded into each pool worker; the pool cancels a job by terminating its worker thread, and the processor must survive a bad build.
Decision: `cs-job` is a separate binary the worker spawns per job — RGBA or the editable save on stdin, the result on stdout, progress and the filename as JSON lines on stderr.
Force: judgment — an addon would work, but native code cannot be interrupted, so a cancelled job would keep burning a core, and a segfault would take the worker process down; a child dies with `kill` and cannot corrupt its parent.
Rejected: a napi-rs addon (cancellation and crash isolation, above); running Rust over HTTP as a second service (another container, port and failure mode for no gain).
Consequence: each job pays a spawn and a copy through pipes — milliseconds against jobs of seconds to minutes — and the chart crosses as the editable save Rust already parses. `CS_JOB=0` returns to TypeScript without a rebuild.
Evidence: processor/rust-jobs.ts; tests/unit/rust-sidecar.spec.ts; rust/cs-job/src/main.rs
