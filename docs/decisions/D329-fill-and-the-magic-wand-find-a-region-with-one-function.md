# D329 · Fill and the Magic wand find a region with one function
Date: 2026-10-07 · Goal: G-116 M1 · Status: active (superseded by: —)
Context: the flood that finds a touching region lived inside `fillSymmetric`; the Magic wand needs the same region to select it.
Decision: `floodRegions` and `regionMask` in `lib/editor/region.ts` find a region by `RegionRule` (4 or 8 neighbours, same stitch type or not); Fill paints what it visits and the wand selects `regionMask`.
Force: requirement — Owner, 2026-10-07 (G-116): "Make sure that code is not duplicated"; the wand's switches are Fill's.
Rejected: a second flood in the wand (two rules that could drift apart); returning only a mask to Fill (symmetric seeds need to know which seed reached a cell, so Fill keeps the visitor form).
Consequence: a change to what counts as one region changes Fill and the wand together; the test comparing them on every cell must stay.
Evidence: tests/unit/selection-area.spec.ts; tests/unit/symmetry.spec.ts; tests/unit/stitch-kind.spec.ts
