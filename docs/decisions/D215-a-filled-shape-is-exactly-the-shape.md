# D215 · A filled shape is exactly the shape; the brush is its outline's thickness
Date: 2026-09-23 · Goal: G-064 M4 · Status: active (superseded by: —)
Context: every shape tool stamps the brush along its spine (D214). Stamping a filled shape would grow it by the brush radius, so a filled 6x4 box drawn with a 7-wide brush would cover 12x10 stitches.
Decision: a filled shape is rasterised and painted one stitch per cell, ignoring the brush size; the brush stamp applies only to an outline, which is what "outline the same size as brush" asks for (Owner, 2026-09-23).
Force: requirement — the Owner asked for the brush size to be the outline's thickness, and a filled shape has no outline to thicken.
Rejected: stamping the filled spine too (the shape stops matching the box that was dragged); eroding the spine by the brush radius first (the same shape by a longer road).
Consequence: the fill choice decides whether the gesture stamps at all. A shape tool added later must say which it is.
Evidence: tests/e2e/shape-tools.spec.ts; tests/unit/shape-raster.spec.ts; app/hooks/use-canvas-tools.ts
