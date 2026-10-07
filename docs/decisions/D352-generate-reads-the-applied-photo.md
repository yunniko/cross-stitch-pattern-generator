# D352 · Generate reads the photo as applied; the sliders are a preview until Apply
Date: 2026-10-08 · Goal: G-124 M3 · Status: active (superseded by: —)
Context: The sliders now change the photo only on Apply, are given up on Cancel or on leaving the Picture tab or Photo, and are undoable (Owner, 2026-10-07). Older charts store slider values that the server applies.
Decision: Generate, tries and colour prediction use the applied photo with neutral sliders, except for an untouched photo that a chart with stored sliders was made from, which keeps that chart's sliders.
Force: requirement — the Owner's instruction "Photo as applied only" (2026-10-07); keeping a legacy chart's sliders is what makes it regenerate as it was made.
Rejected: sending unapplied sliders too (Generate would differ from the photo shown after Apply); dropping stored sliders (older charts would regenerate differently).
Consequence: `generationPhotoAdjust` is the one place this rule lives; a note by Generate warns of unapplied sliders. Refines D349.
Evidence: lib/editor/photo-adjust-session.ts; tests/unit/photo-adjust-session.spec.ts; tests/e2e/photo-sliders-generate.spec.ts
