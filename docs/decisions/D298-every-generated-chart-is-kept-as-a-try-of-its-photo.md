# D298 · Every generated chart is kept as a try of its photo
Date: 2026-10-05 · Goal: G-095 M4 · Status: active (superseded by: —)
Context: a Regenerate replaced the chart, so comparing two settings meant generating the first again.
Decision: each Generate's chart is kept as a try (`lib/editor/tries.ts`) with the settings that made it. Going back to one makes it the chart as one undoable step, puts those settings back and sends no job. Tries are kept in IndexedDB beside the open chart (`tries-store.ts`), a chart per entry, and follow the photo.
Force: requirement — Owner, 2026-10-05: survive a reload; the last 5; pin and delete; pinned are extra, also up to 5.
Rejected: tries as charts apart from the one being edited (two charts to keep apart; choosing a try is undoable instead); keeping tries of every photo (unbounded storage).
Consequence: tries of another photo are dropped when a photo is taken up; the question before a new chart says how many are pinned. A new generation setting is kept with a try by being declared (`trySettingsOf`). A colour recommendation may still be asked for when a try's settings come back.
Evidence: tests/unit/tries.spec.ts; tests/e2e/tries.spec.ts
