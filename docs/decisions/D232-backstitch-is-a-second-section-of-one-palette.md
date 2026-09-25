# D232 · Backstitch is a second section of one palette, counted by length
Date: 2026-09-25 · Goal: G-073 M4 · Status: active (superseded by: —)
Context: a thread can be used for crosses, for backstitch or for both, and the list had one section built around stitch counts.
Decision: one palette, listed twice. The backstitch section sits under the crosses, showing only the threads with lines and reading the same `PaletteColor` entries — so a rename, a recolour or a merge shows in both at once. Its count is **length in cells**, shown in cm at the fabric count, not a number of lines.
Force: requirement — the Owner set the section and "one palette entry with two counts" (2026-09-25). Length rather than line count is judgment: two lines of equal length cost the same thread however they were drawn.
Rejected: a separate backstitch palette (a thread used for both would be two entries to rename twice); counting lines (prices long and short alike).
Consequence: anything removing a palette entry must renumber the lines too — `mergeColors` does, and merging into the empty thread deletes them, since a line cannot be "no colour".
Evidence: tests/unit/backstitch.spec.ts; tests/e2e/backstitch-threads.spec.ts
