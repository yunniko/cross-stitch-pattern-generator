# D033 · Fabric count, unit and author name are persisted options; the open project restores on reload
Date: 2026-09-10 · Goal: G-015 · Status: partly superseded (superseded by: D100 for project storage)
Context: The Owner wanted unit and fabric count moved to options, an author name, all stored locally, and the open project restored after reload.
Decision: One storage module owns every localStorage access, with best-effort guards. Options live in an Options panel, the default unit is cm, and the author name appears in the PNG chart header. Restore reuses the same load path as Open, and saves are gated until restore finishes.
Rejected: a second project format (reuses the editable JSON); saving before restore completes (would overwrite the saved project with defaults); useSyncExternalStore (doesn't fit the multi-step async restore).
Consequence: The set-state-in-effect lint rule forbids synchronous setState in an effect, so mount-time restores defer it in a microtask. D100 moved the project itself to IndexedDB.
Evidence: lib/editor/workspace-storage.ts; tests/unit/workspace-storage.spec.ts; app/hooks/use-workspace-options.ts; HANDOVER.md D33 as of commit f7bb51c.
