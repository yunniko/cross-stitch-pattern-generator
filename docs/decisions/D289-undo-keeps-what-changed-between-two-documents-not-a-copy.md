# D289 · Undo keeps what changed between two documents, not a copy
Date: 2026-10-05 · Goal: G-094 M1 · Status: active (superseded by: —)
Context: undo kept fifty full copies of the chart: 105 MB at 1500 × 1500, 213 MB with half stitches, and more for every layer.
Decision: the chart is a document of layers (`lib/document/`); a history step is the difference between two documents, found by comparing them when the edit is committed, stored as the changed runs of stitches XORed, and applied either way. Tools still hand over a whole new chart.
Force: judgment — the measurements: under 3 MB for ordinary editing, about a millisecond a commit.
Rejected: a hand-written command with its own inverse for each of some forty operations (each inverse is a place for undo to be wrong; a comparison is exact by construction); keeping the copies (memory grows with every layer).
Consequence: a change belongs to the two documents it was made from and refuses any other. A change of size or of the set of layers keeps both documents. If the comparison ever costs too much, a tool may say which region it changed.
Evidence: docs/reviews/2026-10-05-undo-and-flatten.md; tests/unit/document.spec.ts; scripts/measure-undo.ts
