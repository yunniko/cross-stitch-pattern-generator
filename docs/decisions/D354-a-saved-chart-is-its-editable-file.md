# D354 · A saved chart is its editable file, kept whole by an id of the server's, private to its owner
Date: 2026-10-08 · Goal: G-108 M2 · Status: active (superseded by: —)
Context: The Owner asked for Save to an account, where "saving should generate id not being saved by name", and for a save over a chart changed elsewhere to ask first (2026-10-06).
Decision: `SavedChart` keeps the editable JSON with its photo as sent, checked by the editor's own reader; the id is a cuid made at the first save; an overwrite names the version it last saw and is refused with 409 otherwise; the size counts against `storage.charts`; anyone but the owner gets 404.
Force: requirement — the Owner's id rule and conflict answer; 38 MB per save is under the vhost's 40 MB body cap.
Rejected: a separate photo store (two things to keep in step); keying by name (the Owner ruled it out); 403 for a stranger (it would say the id exists).
Consequence: every route asks `chartAllowed`; part 2's visibility changes that one function.
Evidence: lib/charts/saved-charts.ts; tests/unit/saved-charts.spec.ts; tests/e2e/saved-charts-api.spec.ts
