# D260 · The Pattern Keeper PDF and the OXS file carry half stitches as whole stitches
Date: 2026-10-01 · Goal: G-082 M4 · Status: active (superseded by: —)
Context: Pattern Keeper reads whole stitches from the PDF's real text symbols, and the OXS format's part stitch names a diagonal (direction 1 "/", 2 "\", Ursa Software's spec, read 2026-10-01) but not which triangle of the cell a single colour fills.
Decision: both exports show every half stitch as a whole one, in the grid and in the legend's counts; every other export (chart PNGs, A4 pages with their colour key, the preview, the editable save) shows half stitches, and the colour key and legend list every stitch type and thread.
Force: requirement — Owner, 2026-10-01: "In Pattern Keeper they are exported as full stitches"; for OXS, nothing verifiable says how another program would read a half stitch's colour.
Rejected: OXS part stitches with guessed colour sides (another program might draw the wrong triangle).
Consequence: `Pattern::whole_stitches` (Rust) and `wholeStitches` (TypeScript) feed those two exporters; if OXS gains a verified reading, this is revisited. The importer still shows a file's part stitches as whole ones.
Evidence: rust/cs-export/tests/half_stitches.rs; tests/unit/half-stitch-export.spec.ts; https://www.ursasoftware.com/OXSFormat/ (retrieved 2026-10-01)
