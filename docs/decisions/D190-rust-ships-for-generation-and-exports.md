# D190 · Rust ships for generation and every server-side export
Date: 2026-09-20 · Goal: G-048 M5 · Status: active (superseded by: —)
Context: criterion 5 ships a part that is 25 % faster on the host at the cap, uses no more memory, and meets its equivalence criterion.
Decision: generation and every export the processor runs move to Rust; TypeScript stays in the tree as the reference and the fallback, and the parity harnesses stay the check that the two agree.
Force: requirement — Owner instruction (2026-09-20, "we should choose rust over ts"), on the report's measurements: 1.6–13.0× at one thread, byte-identical or criterion-3 equivalent, and far lower export memory (Export all at 1500 stitches 220 MB against 943).
Rejected: shipping only the parts that clear every clause (the Owner asked for Rust as a whole); WASM (half native speed, D186).
Consequence: generation at 1500 stitches uses more memory than TypeScript in Standard (222 MB against 180) and Crisp+ (241 against 232) — the clause not met, accepted by the Owner; three concurrent jobs stay near 723 MB of the cap. A job gets one thread: the pool is 3 on 3 CPUs.
Evidence: docs/reviews/2026-09-20-rust-comparison-report.md; docs/reviews/2026-09-19-rust-m4-exports.md; scripts/rust-export-probe.ts
