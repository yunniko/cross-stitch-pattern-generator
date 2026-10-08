# D355 · Save is a menu of account and file; which saved chart is open lives beside the chart, not in it
Date: 2026-10-08 · Goal: G-108 M3 · Status: active (superseded by: —)
Context: The Owner asked for Save in groups: Save and Save as copy to the account (the copy only once saved), and the file, with the id deciding what a save overwrites (2026-10-06).
Decision: The link (id, version, time) is editor state kept in the autosave record and set only by the replace table's `savedChart` column: a restore gives it back, a regenerate keeps it, every other arrival forgets it.
Force: requirement — the Owner's menu groups and id rule; undo must not move which chart a save overwrites.
Rejected: the link inside `StitchPattern` (undo would revert it, and the file would carry it); one button with a dialog (the Owner asked for groups).
Consequence: a new way for a chart to arrive adds a row naming its `savedChart`; a stale link (404) is forgotten and told, never silently re-created.
Evidence: lib/charts/saved-chart-link.ts; lib/editor/document-replace.ts; tests/unit/document-replace.spec.ts; tests/e2e/save-to-account.spec.ts