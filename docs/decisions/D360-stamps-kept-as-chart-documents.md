# D360 · A stamp is kept as an editable chart of the piece, limited by count
Date: 2026-10-08 · Goal: G-119 M2 · Status: active (superseded by: —)
Context: Stamps must be kept by the server, checked by the same rules as a saved chart's contents, and limited by an entry in the existing list of limits.
Decision: A stamp is the piece as a chart document of its own (its threads only those it uses) plus `stampMask`, read by `parsePatternDocument` and stored re-serialized in a `Stamp` table; `stamps.count` (default 100) limits how many, and one stamp is at most 4 MB.
Force: judgment — the acceptance names the rules and a limit; the document shape and the numbers are chosen.
Rejected: a format of its own (a second reader to keep safe); counting stamps against `storage.charts` (the Owner asked for a limit in number); keeping the photo (a stamp places stitches only).
Consequence: placing reads a stamp with the chart reader, so a stamp kept today opens after any format migration a chart does.
Evidence: lib/stamps/stamp.ts; tests/unit/stamps.spec.ts; tests/e2e/stamps-api.spec.ts; prisma/migrations/20261008180000_stamps/migration.sql