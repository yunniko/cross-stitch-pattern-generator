# D350 · The photo's history is bounded by bytes, and the Wand and Apply run off the main thread
Date: 2026-10-07 · Goal: G-124 M1 · Status: active (superseded by: —)
Context: Delete and Apply must be undoable (Owner, 2026-10-07). A step is a whole RGBA photo, up to 64 MB, and in the worst case measured the Wand takes 1.2 s and Apply 6.5 s on a 12 MP photo.
Decision: The photo history keeps whole photos, apart from the chart's history. The undo steps share 256 MB, the oldest dropped first; the loaded photo is kept outside that budget so Restore original always works. The Wand and Apply run in a worker.
Force: judgment — whole photos make undo exact and simple. The budget gives four or five steps on the largest photo, and many more on typical ones.
Rejected: storing per-step differences (Apply changes every pixel, so they save nothing); a count limit (wrong for small and large photos alike); the main thread (seconds of frozen page).
Consequence: a new kind of photo edit is a function in `lib/photo/` that returns a new photo, and is pushed with `pushPhotoStep`.
Evidence: lib/photo/photo-history.ts; tests/unit/photo-edit.spec.ts; docs/reviews/2026-10-07-photo-edit-cost.md
