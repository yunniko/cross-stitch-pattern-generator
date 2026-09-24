# D222 · The safety net is properties and gates, not only recorded hashes
Date: 2026-09-24 · Goal: G-068 M4 · Status: active (superseded by: —)
Context: M3 left 18 golden hashes as nearly the whole regression floor. They pin 18 fixed inputs, say nothing about a nineteenth, and none named enhancement, dither, Vivid or Crisp+ — shipped options whose output nothing checked.
Decision: the floor is three layers: recorded hashes for byte identity, Rust property tests for what must hold of *any* chart, and the enhancement release gates D118 rests on.
Force: requirement — D118 makes releasing a mode conditional on gates that M3 deleted with the spec that ran them, and hashes provably cannot cover the input space.
Rejected: more golden cases alone (breaking transparency handling entirely leaves all 73 golden assertions passing); porting the 528 deleted unit tests (they tested TypeScript internals that no longer exist).
Consequence: a new generation option needs a golden case *and* an entry in `option_cases()`; a new enhancement mode is not released until the gates pass it. The recorder only ever adds — a moved hash is a bug to explain, never a file to regenerate.
Evidence: rust/cs-core/tests/pattern_invariants.rs; scripts/rust-enhancement-gates.ts; scripts/rust-enhance-parity.ts
