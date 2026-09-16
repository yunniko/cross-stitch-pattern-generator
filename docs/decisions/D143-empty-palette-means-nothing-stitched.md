# D143 · An empty palette is legal only for a chart with nothing stitched
Date: 2026-09-16 · Goal: G-040 M1 · Status: active (superseded by: —)
Context: A chart started from scratch has no colours yet, but the file validator refused every empty palette outright.
Decision: `deserializePatternData` accepts an empty `palette` array. The per-cell check that follows then allows only `EMPTY_CELL`, so a file naming a colour it doesn't carry is still refused, and the format version stays 7.
Rejected: giving a blank chart a starting colour (the Owner asked for an empty palette); a new format version (the file's shape is unchanged, and an older reader refuses a chart it can't show anyway); a separate "blank" flag (a chart is photo-free because it has no photo, not because of a flag).
Consequence: Any reader must treat an empty palette as "nothing stitched yet". A blank chart survives saving, autosave and reopening, and stays photo-free for life.
Evidence: lib/editor/blank-pattern.ts; tests/unit/blank-pattern.spec.ts; lib/editor/pattern-serialize.ts
