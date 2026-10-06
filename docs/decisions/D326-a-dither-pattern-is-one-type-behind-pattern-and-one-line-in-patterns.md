# D326 · A dither pattern is one type behind `Pattern` and one line in `PATTERNS`
Date: 2026-10-07 · Goal: G-100 M2 · Status: active (superseded by: —)
Context: the patterns were an enum matched in four places, with the drawn marks' settings read and recorded by the pipeline and the JSON layer.
Decision: `rust/cs-core/src/dither/mod.rs` declares the `Pattern` contract (id, arithmetic, whether it has settings, its settings as recorded) and the `PATTERNS` list of id and `configure`, as `OVERLAYS` does (D294); each family is a module that reads its own settings.
Force: requirement — Owner, 2026-10-05 (G-100): a pattern is one module behind one contract.
Rejected: one module per matrix pattern (a matrix is a row of data, D198; a family declares several ids); a new key for a pattern's settings (charts carry `ditherTexture`, so it stays).
Consequence: every `configure` runs on every request so its settings are never refused as unknown; an id never changes. Charts are unchanged: 74 golden hashes and the eight measured charts.
Evidence: rust/cs-core/tests/settings.rs; scripts/rust-goldens.ts; docs/reviews/2026-10-07-dither-preview-baseline.md
