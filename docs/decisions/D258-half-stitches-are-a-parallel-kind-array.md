# D258 · Half stitches are a parallel `cellKind` array, absent while every stitch is whole
Date: 2026-10-01 · Goal: G-082 M1 · Status: active (superseded by: —)
Context: a cell may hold half a cross ("/" or "\"). 22 modules and the Rust exporter read `cellPalette`, whose byte holds one of up to 100 threads or EMPTY.
Decision: a second array, `StitchPattern.cellKind` (0 whole, 1 "/", 2 "\"), same indexing, absent for a chart with no half stitch; an empty cell is always whole; a flip, a quarter turn or a mirror across the vertical or horizontal axis swaps "/" and "\".
Force: judgment — it leaves every existing chart, file and code path untouched; nothing outside the Owner's one-kind-per-cell answer compels it.
Rejected: packing the kind into the `cellPalette` byte (no room for 100 threads); a sparse list like backstitch (halves need undo, selection, symmetry and fills like any cell).
Consequence: any code that writes cells must also write kinds or go through `withCellPalette`/`withCounts`, which make a changed cell whole and tidy the array; the project store and the saved file name `cellKind` by hand.
Evidence: tests/unit/stitch-kind.spec.ts; lib/editor/stitch-kind.ts
