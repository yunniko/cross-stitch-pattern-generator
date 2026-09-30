# D252 · The rulers are canvases beside the scrolling well, and the pointer hides where an outline is drawn
Date: 2026-09-30 · Goal: G-078 M1 · Status: active (superseded by: —)
Context: the Owner wants rulers on all four edges of the viewer, numbered at every 10th stitch, with a marker at the pointer, and no pointer over the chart with the brush.
Decision: four canvases in grid cells around the scroller, each as long as the well, redrawn from the page's own geometry on scroll, zoom, resize and pointer move; the OS pointer is hidden whenever the tool draws its outline.
Force: requirement — Owner instruction, 2026-09-30 (four sides, every 10th stitch, pointer marker, pointer hidden with the brush).
Rejected: layers over the well (they would cover the chart's edge and shift what the renderer measures, D135); one element per mark (thousands at a small zoom); hiding the pointer for the brush alone (Line, Rectangle, Oval, Fill and Lasso fill carry the same outline; a one-line change if the Owner wants it narrower).
Consequence: numbers thin to every 20th, 50th, 100th when 10 stitches are under 34 px (`lib/editor/ruler.ts`).
Evidence: tests/unit/ruler.spec.ts; tests/e2e/rulers.spec.ts
