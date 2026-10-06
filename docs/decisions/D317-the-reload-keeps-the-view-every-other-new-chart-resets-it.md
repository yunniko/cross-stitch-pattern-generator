# D317 · The reload keeps the view; every other new chart resets it
Date: 2026-10-06 · Goal: G-110 M3 · Status: active (superseded by: —)
Context: the Owner asked for the view's switches to survive a reload, while D283 resets the view for every new document, and the autosaved chart came back through the same `open` row as a file.
Decision: the autosaved chart brought back on load is a row of its own, `restore`, identical to `open` but for a new `chartView: keep`; every other new document resets the switches.
Force: requirement — the Owner's instruction (2026-10-06) that the switches survive a reload, with D283 standing for new charts.
Rejected: keeping the view on every open (a file opened would inherit the last chart's photo and visibility, against D283); restoring the view from the saved project (the view is the browser's, as the other workspace settings are, not the chart's).
Consequence: the view lives in `WorkspaceOptions` and `useEditorView` only reads and sets it; a new row in `REPLACE_PLANS` must say whether it resets the view.
Evidence: tests/unit/document-replace.spec.ts; lib/editor/document-replace.ts
