# D098 · Project autosave moves to IndexedDB, photo stored once by content hash
Date: 2026-09-13 · Goal: G-031 M1 · Status: active (superseded by: —)
Context: the autosaved project was one localStorage string (JSON number array for cells plus the base64 photo), so every large project exceeded the ~5 MB quota and the write failed silently on every edit.
Decision: `lib/editor/project-store.ts` writes the project record (`cellPalette` as the typed array itself) and the photo (keyed `photo:<sha-256>`, written only when absent, pruned when unreferenced) into one IndexedDB object store behind a four-method key/value interface with an in-memory test adapter; `useProjectAutosave` debounces 500 ms, serializes saves, flushes on `pagehide`, and reports `unavailable` on failure; localStorage keeps only `WorkspaceOptions`, every access wrapped, plus a one-time migration read of the old project key.
Rejected: base64 `cellPalette` (the goal's wording) — structured clone stores bytes natively, base64 only adds 33 % and an encode per save; an IndexedDB library — a ~60-line adapter suffices.
Consequence: `save` may reject; callers must surface that, never swallow it. The record is versioned (`storeVersion`); bump it with a migration rather than reinterpreting old records.
Evidence: tests/unit/project-store.spec.ts; tests/e2e/autosave.spec.ts (>4 MB photo survives a reload).
