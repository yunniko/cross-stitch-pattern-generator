# D264 · The A4 pages take a cell size in mm and carry the page marks, in Rust only; the Pattern Keeper PDF is pinned
Date: 2026-10-01 · Goal: G-083 · Status: active in part (superseded by: D396)
Context: the Owner asked for a cell size in mm for the A4 export (default twice the old 2.75 mm), the centre marked, page letters with a map first, overlap labels and a skein table, without touching the Pattern Keeper export.
Decision: the A4 pages use their own layout (`calculate_a4_layout`: the setting's cell size, 8 mm margin and 12 mm gutter) and the marks, map and table, all in the Rust exporter; the full-size chart keeps its pixel size and gains the centre marks in Rust and TypeScript; the Pattern Keeper PDF keeps `calculate_layout` and passes no marks.
Force: requirement — Owner, 2026-10-01: cell size for A4 only, map first, Rust only, Pattern Keeper untouched.
Rejected: updating the TypeScript A4 path too; a shared layout for both (would change the Pattern Keeper PDF).
Consequence: `rust/cs-export/tests/pattern_keeper_pinned.rs` pins that PDF's bytes; the processor's deadline counts A4 pages on the new layout and the PDF's on the old (`gridPagesFor`).
Evidence: rust/cs-export/tests/a4_pages.rs; rust/cs-export/tests/pattern_keeper_pinned.rs; tests/e2e/a4-export-settings.spec.ts
