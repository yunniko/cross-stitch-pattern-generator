# D241 · A chart carries its sliders wherever it goes
Date: 2026-09-27 · Goal: G-074 M5 · Status: active (superseded by: —)
Context: after M4 a chart recorded its sliders but nothing read them back: the photo views drew the uploaded file, and opening a chart left the sliders alone, so Regenerate quietly made a different chart (Owner, 2026-09-27).
Decision: both photo views draw the photo *as adjusted*, prepared in the slider worker and identified by `photoKey` (file plus sliders); and opening a chart that has a photo puts its sliders back.
Force: requirement — the Owner asked for both, and each follows D239: if the chart is the adjusted photo's chart, that is the photo to judge it against and those the sliders to regenerate it with.
Rejected: storing an adjusted `sourceImage` (the server works from the file's own bytes, D150); adjusting on the drawing thread (~0.5 s a view switch); leaving "Original photo" alone for its name's sake (it is what the chart is judged against).
Consequence: the frame carries `data-photo` (`uploaded` or `adjusted`), which says the async frame landed. A chart from an empty canvas has no photo, so its sliders stand.
Evidence: tests/e2e/photo-sliders-generate.spec.ts; tests/unit/adjusted-photo.spec.ts
