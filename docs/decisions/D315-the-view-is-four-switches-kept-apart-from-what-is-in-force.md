# D315 · The view is four switches, kept apart from what is in force
Date: 2026-10-06 · Goal: G-110 M1 · Status: active (superseded by: —)
Context: the five fixed views (Color, Black & white, Stitched, Grid + photo, Original photo) could not combine symbols, the photo and a pattern mode, and each component decided on its own which view allowed what.
Decision: `lib/editor/view.ts` holds the chosen view (pattern mode, Symbols, Photo, visibility 0–100) and derives what is in force with `viewInForce`; every rule (symbols and photo only in Color or Black & white, photo only with one and its feature usable, editing at 5 % visible or more) lives there, and the choice is kept in the workspace options.
Force: requirement — G-110's acceptance criteria (Owner, 2026-10-06), including the 5 % editing floor.
Rejected: a sixth and seventh fixed view (the combinations multiply); clearing a switch that does not apply (the person's choice would be lost on the next chart).
Consequence: drawing, controls and tools read the view in force only; the feature ids `view.realistic` and `view.photo` stay, gating Stitched and Photo.
Evidence: tests/unit/view.spec.ts; tests/unit/workspace-storage.spec.ts
