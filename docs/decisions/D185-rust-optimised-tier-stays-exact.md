# D185 · The optimised Rust tier stays exact: threads only where results cannot change
Date: 2026-09-19 · Goal: G-048 M3 · Status: active (superseded by: —)
Context: G-048 planned an optimised tier allowed to differ from TypeScript within tolerances. In practice, most of the time goes to per-cell or per-point work that can run on threads without changing results.
Decision: stages run on rayon only where each output depends on its own inputs; every floating-point sum keeps the TypeScript order. ICM, the other sums and Crisp+ pruning stay sequential. No hand-written SIMD; the default build targets baseline x86-64.
Force: judgment — any thread count gives byte-identical output (36 fixture cases and 15 real-photo cases), so the golden hashes and criterion 2 hold trivially. x86-64-v3 gained only 1–8 %.
Rejected: parallel reductions and red-black ICM (they change results, which would need criterion 2's tolerances); SIMD over reordered sums (same reason); x86-64-v3 by default (too small a gain to tie the binary to one CPU level).
Consequence: a new parallel stage must keep each value's arithmetic order; the parity harness at RUST_THREADS=3 is the check.
Evidence: scripts/rust-parity.ts; docs/reviews/2026-09-19-rust-m3-optimised.md
