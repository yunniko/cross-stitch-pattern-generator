# D186 · The WASM build uses a raw ABI and runs single-threaded
Date: 2026-09-19 · Goal: G-048 M3 · Status: active (superseded by: —)
Context: criterion 4 asks for generation timed as WASM as well as native. The measurement needs a module Node can load; nothing ships from it in M3.
Decision: `rust/cs-wasm` exports `alloc`, `dealloc`, `generate` and `result_len`, and returns the same JSON as the CLI. It imports a millisecond clock from `env`. Rayon runs on the calling thread.
Force: tie-break — any bindings layer would do for a benchmark; a raw ABI adds no tooling.
Rejected: wasm-bindgen (a CLI and generated glue to maintain for four functions); WASM threads (they need SharedArrayBuffer, a worker pool and nightly atomics builds, more than a comparison needs).
Consequence: the WASM timings are single-threaded, so they compare with native at one thread. If WASM were ever shipped, a bindings layer and threads would be a new decision.
Evidence: rust/cs-wasm/src/lib.rs; scripts/rust-parity.ts (RUST_WASM=1)
