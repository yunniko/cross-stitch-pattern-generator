# D294 · Overlays share one contract, and a new setting can be drawn from its declaration
Date: 2026-10-05 · Goal: G-099 M3 · Status: active (superseded by: —)
Context: traced lines and texture strokes were two special cases inside the pipeline; a new setting needed a control written for it, a stored field and a type.
Decision: what is laid over the stitches implements `Overlay` and is listed in `OVERLAYS` (`rust/cs-core/src/overlay.rs`). A setting declared with a `control` is drawn by `app/components/declared-settings.tsx`, kept in one bag by id and sent with every Generate.
Force: judgment — it is what made the proof one declaration and one module.
Rejected: drawing the existing controls from declarations too (they have pickers and previews of their own; that is G-095's); a registry for every family now (edge modes span five stages).
Consequence: a new overlay is a Rust module, its `mod` line and its place in `OVERLAYS`. A new dither pattern or edge mode still edits its family's own module, and a new stage edits the stage table. Drawn settings are a flag, a number from 0 to 1 or a choice.
Evidence: tests/unit/generation-settings.spec.ts; rust/cs-core/tests/settings.rs; the proof in the goal's log
