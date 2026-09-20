# D196 · Transparency becomes absence, at half coverage
Date: 2026-09-20 · Goal: G-050 · Status: active (superseded by: —)
Context: a photo with transparency charted as white stitches, and every stage read a transparent pixel's RGB — usually black — as a colour, so a subject grew a ring of invented edges.
Decision: a cell the photo covers less than half becomes an empty stitch (D143's sentinel), and colour, edge, evidence and thread stages read covered pixels only. Two masks carry it: cell coverage and pixel opacity.
Force: requirement — Owner instruction (2026-09-20), including the half-coverage threshold, which decides anti-aliased edges the way a stitcher would.
Rejected: keeping transparent cells white (the user would erase a background by hand); treating any transparency as empty (one stray pixel punches a hole); quantizing transparent pixels as a colour (it spends a thread on nothing).
Consequence: both masks are `None` for an opaque photo, which runs the old code and keeps the golden hashes meaningful. Rust carries the same masks; a new stage must skip empty cells or read the sentinel as palette index 255.
Evidence: tests/unit/transparent-background.spec.ts; tests/e2e/transparent-photo.spec.ts; scripts/rust-parity.ts (the `alpha/` cases)
