# D290 · Fabric belongs to the chart, and the file has one migration step
Date: 2026-10-05 · Goal: G-094 M4 · Status: active (superseded by: —)
Context: fabric count and unit were kept in the browser, so a chart opened elsewhere took that browser's; older file versions were handled by conditions spread through the reader.
Decision: a chart has an optional `fabric` (count, unit), saved in its file and autosave and used in place of the browser's; changing it is an undo step, and the browser keeps the last choice for new charts. `lib/document/migrate.ts` brings any earlier version to the current one and refuses a later one by name.
Force: requirement — G-094's criterion, accepted by the Owner 2026-10-05: fabric count travels with the chart.
Rejected: raising the format version (the field is optional and an older build ignores it, D138); stamping a fabric on old files when opened (they would no longer re-save byte for byte).
Consequence: the version is raised only for a change an older build would misread, with its migration in the same change. The Rust editable writer writes every field the TypeScript one does; a test compares their bytes.
Evidence: tests/unit/file-migration.spec.ts; tests/e2e/fabric-in-chart.spec.ts; rust/cs-export/tests/editable_keeps_fields.rs
