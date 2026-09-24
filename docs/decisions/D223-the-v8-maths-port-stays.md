# D223 · The V8 maths port stays; it is the fast path, not a parity tax
Date: 2026-09-24 · Goal: G-070 M1 · Status: active (superseded by: —)
Context: after G-068 deleted the TypeScript pipeline, `jsmath.rs` + `fdlibm.rs` (1,153 lines) appeared to exist only to match a language no longer in the repository, and G-070 was opened to remove them.
Decision: they stay. Measurement refutes the premise.
Force: requirement — measured. Swapping them for Rust's `std` or the `libm` crate makes generation **13–25% slower** across five workloads while changing **zero cells** of output; and `std` resolves to the platform C library, so it would make a chart depend on the OS that produced it.
Rejected: Rust `std` maths (slower, and platform-dependent output); the `libm` crate (slower, and still 8.4% divergent on `cbrt`, so the hashes would move for no gain).
Consequence: do not reopen this without new measurements. The port is inlined into the per-pixel colour loops, which is why it wins; any future replacement must be benchmarked in `color.rs`'s hot path, not judged by line count. Cheap wins that remain: a `target-cpu` baseline (~5%, byte-identical output).
Evidence: docs/reviews/2026-09-24-parity-tax.md
