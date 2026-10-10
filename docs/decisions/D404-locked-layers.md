# D404 · A locked layer keeps its stitches, name and merges; chart-wide edits still apply
Date: 2026-10-10 · Goal: G-133 M2 · Status: active (superseded by: —)
Context: the Owner asked for layers "visible but protected from changes" (2026-10-10); what a chart-wide edit does to a locked layer had to be settled.
Decision: a locked layer refuses drawing, renaming, deleting and merging either way; it may be hidden and moved, and crop, move, colour merges and loaded palettes change it with every other layer.
Force: judgment — leaving a locked layer out of a crop or shift would misalign it with the others, and a palette change is the chart's, not one layer's.
Rejected: freezing it against chart-wide edits too (layers would drift apart); refusing chart-wide edits while any layer is locked (a lock would block unrelated work).
Consequence: the lock is an optional header field, written only when true, so files without it read as before and older builds ignore it; a locked single layer saves as format 8. `withLayerView` refuses a locked layer's stitch change by name behind the tools' refusal.
Evidence: tests/unit/layers.spec.ts; tests/e2e/layers-tools.spec.ts