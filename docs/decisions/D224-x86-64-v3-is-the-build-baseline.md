# D224 · `x86-64-v3` is the build baseline, and the config lives at the repository root
Date: 2026-09-24 · Goal: G-071 M1 · Status: active (superseded by: —)
Context: Rust defaults to the 2003 x86-64 instruction set, so the release image was compiled for a CPU two decades older than the EPYC it runs on.
Decision: `.cargo/config.toml` at the repository root sets `target-cpu=x86-64-v3` for the three x86-64 targets used (musl, gnu, msvc).
Force: requirement — measured. Mean 6.6% faster generation over five workloads (2.1–10.1%) with byte-identical output: 38 golden hashes unmoved, 0 cells differing, and the V8 vector test still exact, so FMA contraction changes nothing here.
Rejected: `native` (6.9%, barely more, and it compiles for whichever machine ran the build, so images could differ or fault after a VPS migration); `x86-64-v2` (3.8%); `[build] rustflags` (would reach the `wasm32` build of `cs-wasm`).
Consequence: building this needs a ~2013 CPU or later; below that the binary faults rather than running slowly. **The config must stay at the root**: cargo reads config upwards from the working directory, and every build here runs from the root via `--manifest-path`, so in `rust/` it would be silently ignored.
Evidence: docs/reviews/2026-09-24-parity-tax.md; .cargo/config.toml
