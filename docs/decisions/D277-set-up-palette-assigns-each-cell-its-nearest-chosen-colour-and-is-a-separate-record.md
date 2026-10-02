# D277 · Set-up palette assigns each cell its nearest chosen colour, and the set is a record apart from the chart's palette
Date: 2026-10-02 · Goal: G-087 M2-M4 · Status: active (superseded by: —)
Context: the user chooses the colours of a chart; a chart may later be regenerated automatically.
Decision: with a set, every cell takes the nearest set colour in Oklab (no merging, exact thread colours, standard edges), and the set is stored apart from the chart's palette as `generationPalette {mode, colors, active}` in the editable file.
Force: requirement — Owner, 2026-10-02: closest colour whatever is missing; the chart's palette and the set are "a different entity"; a file without a set is a new chart. Crisp edges being ignored is judgment (they merge colours).
Rejected: refusing a set that misses a colour (a missing skin tone may be the art); a format version bump (the field is optional and old files open as before).
Consequence: editing the chart's colours never changes the set; a missing-colour warning is advice from `predict.rs` and never blocks Generate.
Evidence: rust/cs-core/tests/palette_set.rs; tests/unit/palette-set.spec.ts; tests/e2e/palette-setup.spec.ts
