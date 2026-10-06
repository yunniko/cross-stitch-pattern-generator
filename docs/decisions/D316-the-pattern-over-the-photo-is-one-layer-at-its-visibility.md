# D316 · The pattern over the photo is one layer, laid at its visibility
Date: 2026-10-06 · Goal: G-110 M2 · Status: active (superseded by: —)
Context: the view's slider sets how visible the pattern is over the photo (D315), replacing Grid + photo's fixed 35 % photo under a fill-less outline with haloed symbols.
Decision: the photo is drawn at full strength, and the ordinary Color or B&W chart (fills, symbols, grid, Isolate, backstitch) is drawn into one reused canvas and laid over it at the visibility.
Force: judgment — a single layer keeps a grid line over a fill from being faded twice, and reuses the chart's own drawing instead of a second one.
Rejected: drawing each part at the visibility straight onto the photo (overlaps fade twice and look patchy); keeping the fill-less outline with haloed symbols beside it (a second drawing of the chart to keep in step, and slower: scrolling over the photo went from 683 to 549 ms without it).
Consequence: `drawChartOutline` and the halo allowance in `chartPaintOverhangPx` are gone; a selection outline stays outside the layer, at full strength.
Evidence: tests/e2e/chart-viewport-parity.spec.ts; docs/reviews/2026-10-06-view-switches.md
