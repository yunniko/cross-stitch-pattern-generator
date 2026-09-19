# D180 · The OXS export is built a row at a time
Date: 2026-09-19 · Goal: G-046 M4 · Status: active (superseded by: —)
Context: `serializeOxs` gathered one line per stitch into a single array before joining it: 430 MB of heap at 1500 stitches and 1021 MB at 2000, against a worker's 1048 MB default heap.
Decision: `serializeOxsParts` returns the header, one piece per stitch row and the footer; the single export writes the pieces straight into its Blob, and Export all encodes them into one byte array for the zip.
Force: judgment — the text is identical and the export's peak RSS fell 1339 → 404 MB at 2000 stitches, 650 → 289 MB at 1500.
Rejected: writing the XML as bytes directly (the same saving with a second writer to keep in step with the parser's tests).
Consequence: `serializeOxs` remains, joining the pieces, for callers that need a string.
Evidence: tests/unit/oxs-serialize-parts.spec.ts; docs/reviews/2026-09-19-new-cap-measurements.md
