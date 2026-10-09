# D390 · A chart is an ordered list of layers, each of a kind declared once in a registry
Date: 2026-10-09 · Goal: G-130 M1 · Status: active (superseded by: —)
Context: layers must be added, hidden, reordered and merged, and later kinds (bitmap, vector) must fit without reworking the document.
Decision: `ChartDocument.layers` holds headers plus kind fields; `lib/document/layer-kinds.ts` declares each kind's drawing, merge, colours, transforms and file fields; the composite (`flatten`) feeds display and exports, a layer's view feeds the tools; a one-layer chart is still written as format 7, a layered one as format 8.
Force: judgment — the Owner's request for extensible layers; at most 32 layers, a judgment against undo and file size.
Rejected: the composite as a handle to its document (spreads and the export worker lose the link); always writing format 8 (older open tabs could not read plain charts).
Consequence: chart-wide edits (crop, move, palette merges) go through `lib/editor/document-edit.ts`; there is no chart-wide rotate to carry. A tab of an older build discards a format-8 autosave it cannot read.
Evidence: tests/unit/layers.spec.ts; tests/unit/file-migration.spec.ts; scripts/measure-undo.ts (0.7 MB for 50 edits)