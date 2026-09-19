# D184 · Rust also ports V8's sin, cos, atan2, log and hypot
Date: 2026-09-19 · Goal: G-048 M2 · Status: active (superseded by: —)
Context: Crisp evidence, Crisp+ and photo enhancement call `Math.hypot`, `Math.atan2`, `Math.sin`, `Math.cos` and `Math.log`, so the exact tier needs V8's results for these too (D107, D183).
Decision: `fdlibm.rs` ports V8's fdlibm `sin`, `cos` (with both argument reductions), `atan`, `atan2` and `log`. `jsmath::hypot_n` ports V8's Torque `Math.hypot`: it scales by the largest argument and sums with Kahan compensation.
Force: requirement — measured: the `libm` crate differed from V8 on 89 `atan2`, 9,567 `sin`, 9,698 `cos` and 22,837 `log` inputs of about 1.1 M each. The ports differ on none of 13.6 M vectors. This shows Node 22 uses fdlibm trig, not glibc's.
Rejected: `libm` for these functions (the mismatches above); `sqrt(x² + y²)` for `hypot` (not V8's arithmetic).
Consequence: exact-tier code calls `jsmath` for every `Math` function. A Node upgrade needs the vectors regenerated and rechecked, trig included.
Evidence: rust/cs-core/tests/jsmath_vectors.rs; scripts/rust-jsmath-vectors.mjs; docs/reviews/2026-09-19-rust-m2-parity.md
