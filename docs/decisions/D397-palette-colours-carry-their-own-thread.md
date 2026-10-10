# D397 · A palette colour carries its own colour, name and thread; a set's mode only chooses what is offered
Date: 2026-10-10 · Goal: G-131 M3 · Status: active (superseded by: —)
Context: a set of colours held threads by code in one brand, so mixed systems, typed numbers and names were lost, and switching the mode emptied the set.
Decision: each set colour is `{rgb, name?, source?}`; the palette file (version 2), saved palettes and the generation request carry `rgb`, `name`, `system`, `number`; the set's mode only picks what the picker offers. Replace maps by same thread, else nearest OKLab colour.
Force: requirement — G-131 AC1, AC2, AC4 and AC7 (Owner, 2026-10-10): any system, a typed number never changes the colour, names kept, and the Replace mapping as given.
Rejected: keeping `code` beside a new `system` (two ways to name one thread); remapping Replace by palette order (meaningless across palettes).
Consequence: version 1 files (a `code` in a brand's set) still load through the thread table and must keep doing so. Rust keeps a given RGB and uses the name as the label.
Evidence: tests/unit/palette-set.spec.ts; tests/unit/palette-load.spec.ts; rust/cs-core/tests/palette_set.rs; tests/e2e/palette-load.spec.ts
