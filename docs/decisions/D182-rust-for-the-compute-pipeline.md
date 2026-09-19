# D182 · Generation is ported to Rust, a language new to the portfolio
Date: 2026-09-19 · Goal: G-048 M1 · Status: active (superseded by: —)
Context: G-048 asks for the pipeline in a compiled language with native threads and SIMD, measured against TypeScript. No Company project uses one yet.
Decision: the port is Rust: a `rust/` workspace with the `cs-core` library and the `cs-bench` CLI, formatted by rustfmt's defaults and linted by clippy.
Force: requirement — the Owner asked for Rust (2026-09-19) and set that portfolio consistency yields to a better fit (STANDARDS, Tech-stack selection); fit, not consistency, decides here.
Rejected: C++ (no memory safety, and no single build tool the Docker image could rely on); Go (garbage-collected, with SIMD only through assembly or an experimental package); TypeScript with WASM kernels only (not what the Owner asked for, and it keeps the same allocation model).
Consequence: TypeScript stays the reference and the fallback; Rust code ships only through G-048's ship rule. The processor image builds it, so the host installs nothing.
Evidence: scripts/rust-parity.ts; docs/reviews/2026-09-19-rust-m1-parity.md
