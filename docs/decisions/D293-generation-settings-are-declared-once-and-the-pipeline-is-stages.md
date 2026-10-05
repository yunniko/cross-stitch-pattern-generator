# D293 · Generation settings are declared once, and the pipeline is stages
Date: 2026-10-05 · Goal: G-099 M1–M2 · Status: active (superseded by: —)
Context: a generation setting was listed by hand in the request, the processor's check, the options handed to Rust and Rust's parser; the pipeline was one 480-line function branching on every mode.
Decision: `lib/pipeline/generation-settings.ts` declares each setting once and the three TypeScript places read it. In Rust, `settings.rs` holds a request's settings by name, each family of algorithm takes its own, and one nobody took is refused; `pipeline/` runs fourteen stages from a table.
Force: requirement — Owner, 2026-10-05: generation should be expandable as the tools are.
Rejected: one settings file read by both languages (Rust would still need a typed reader for each; the refusal of an unread setting catches the drift instead); a trait object for every stage (most stages have one implementation; a function in a table is enough).
Consequence: a chart must not move: the 74 golden hashes and `scripts/measure-generation.ts` are the gate for any change to a stage. A new setting is declared in TypeScript and read in the Rust module that uses it.
Evidence: docs/reviews/2026-10-05-generation-stages.md; tests/unit/generation-settings.spec.ts; rust/cs-core/tests/settings.rs
