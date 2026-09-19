# D179 · The editor's zoom has no chart-size cap
Date: 2026-09-19 · Goal: G-046 M4 · Status: active (superseded by: —)
Context: `computeCellSize` capped the zoomed chart at 8000 px, a guard from when the chart was drawn onto one canvas its full size; since D135 the canvas covers the view and only the chart frame, which is layout, is chart-sized. The cap left a 1000-stitch chart at 8 px a stitch, 1500 at 5 px, and 2000 unzoomable.
Decision: the cap is removed; every chart zooms to four times its fitted cell size, as small charts always did.
Force: judgment — the cap guarded nothing that still exists, and the editor bench at 1500 stitches measured zoom steps inside G-036's 100 ms longest-task target.
Rejected: raising the cap to a larger number (the same guard for the same absent canvas).
Consequence: a zoomed frame can be tens of thousands of CSS pixels; anything added later that allocates by the frame's size, rather than the view's, reintroduces the wall.
Evidence: docs/reviews/2026-09-19-new-cap-measurements.md; scripts/bench-chart.spec.ts
