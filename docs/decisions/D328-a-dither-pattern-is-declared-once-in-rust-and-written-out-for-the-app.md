# D328 · A dither pattern is declared once, in Rust, and written out for the app
Date: 2026-10-07 · Goal: G-100 M4 · Status: active (superseded by: —)
Context: a pattern's id, name, group, line-screen direction and settings were typed again in TypeScript lists, the chooser and the photo pane.
Decision: `PATTERNS` in `rust/cs-core/src/dither/mod.rs` declares each pattern's name, group, how it is offered (alone, or a variant of a shared choice) and its own settings by key and named control; `cs-bench dither-patterns` writes `lib/pipeline/dither-patterns.ts`, which the chooser, the photo pane, the feature list and the request check read, and CI fails when it is not current.
Force: requirement — Owner, 2026-10-05 (G-100): declared once, the interface drawn from the declaration.
Rejected: a TypeScript list beside the Rust one (two lists again); a generic slider kind in the declaration (judgment: no pattern needs one yet; the drawn marks' texture editor is the one named control).
Consequence: a new pattern is one module and one line in `PATTERNS`; a new named control needs an entry in the photo pane's control map, which the type check demands.
Evidence: rust/cs-core/tests/dither_declarations.rs; tests/unit/dither-declarations.spec.ts; docs/reviews/2026-10-07-dither-pattern-proof.md
