# D219 · The chart rasteriser stays one module; only its words move out
Date: 2026-09-24 · Goal: G-067 M5 · Status: active (superseded by: —)
Context: the 2026-09-24 review called `lib/export/render.ts` four modules in one file at 962 lines and proposed splitting it into chart, cell, text, layout and preview. On inspection the entry points — `drawChart`, `drawCell`, `drawChartOutline`, the overlays, the legend and header — share thirteen private helpers (`fillForCell`, `symbolTextColor`, `drawGridLines`, `effectiveCellSize` and others), and `findChartLayout` measures a header by drawing one.
Decision: only `headerText` and `truncateToWidth` move, to `render-text.ts`; the rasteriser stays one module, re-exporting them so no call site changes.
Force: judgment — the proposed five-way split would have scattered thirteen shared helpers or duplicated them, trading one large cohesive module for five coupled ones. Nothing compelled either shape.
Rejected: the full five-way split (above); moving `legendCanvasExtent` too (its layout constants are also used by the legend and header drawing, so it would export them back).
Consequence: `render.ts` stays over the 500-line trigger in STANDARDS.md deliberately. A new export that needs no canvas belongs in `render-text.ts` or a sibling, not here.
Evidence: lib/export/render-text.ts; lib/export/render.ts; docs/reviews/2026-09-24-architecture-and-style-review.md
