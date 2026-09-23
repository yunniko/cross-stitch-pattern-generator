# D214 · One gesture for every shape tool, spine plus stamp
Date: 2026-09-23 · Goal: G-064 M3 · Status: active (superseded by: —)
Context: Line, and the Rectangle and Oval that follow it, all drag from one stitch to another and all have to be as thick as the brush.
Decision: `useShapeTool` owns the whole gesture and takes a `kind`; each shape contributes only a rasteriser in `lib/editor/shape-raster.ts` returning its spine cells, which the gesture stamps the brush along and mirrors under symmetry.
Force: requirement — thickness follows the brush (Owner, 2026-09-23), so a shape cannot rasterise its own width; and one gesture is what keeps undo, symmetry, the two colours and cancelling identical across three tools.
Rejected: a hook per tool (three copies of capture, clamping, preview and commit to keep in step); rasterising thickness into each shape (the stamp would be reimplemented per tool, and a round brush is not a stroke width).
Consequence: a new shape tool is a rasteriser plus a rail entry, returning spine cells only. A shape's preview replaces each frame instead of accumulating, so `previewShape` redraws from a snapshot of the base scene.
Evidence: tests/unit/shape-raster.spec.ts; tests/e2e/line-tool.spec.ts; app/hooks/use-canvas-tools.ts
