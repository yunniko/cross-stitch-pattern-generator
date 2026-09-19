# D183 · Rust uses V8's own maths routines, proven bit-exact
Date: 2026-09-19 · Goal: G-048 M1 · Status: active (superseded by: —)
Context: the exact tier must reproduce the golden hashes (D107), so every `Math.cbrt`, `Math.pow`, `Math.exp` and `Math.round` has to return V8's double. The `libm` crate, which follows musl, differs from V8 for some inputs.
Decision: `jsmath` ports V8's `cbrt` and `pow` line by line, takes `exp` from `libm`, and reimplements JavaScript's `round`, `min`, `max` and `fround` semantics. The exact tier calls nothing else.
Force: requirement — measured: `libm`'s `pow` differed from V8 on 94,182 of 2,200,256 pipeline-domain inputs and its `cbrt` differed too, while the ports differ on none of 6.5 million.
Rejected: Rust's `f64` methods (they use the platform's C library, which differs by platform); `libm` for everything (the mismatches above).
Consequence: exact-tier code must not call `f64::powf`, `cbrt` or `exp`. Upgrading Node needs the vectors regenerated and rechecked.
Evidence: rust/cs-core/tests/jsmath_vectors.rs; scripts/rust-jsmath-vectors.mjs
