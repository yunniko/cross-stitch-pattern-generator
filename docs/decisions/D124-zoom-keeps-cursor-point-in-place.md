# D124 · Zooming keeps the point under the cursor in place
Date: 2026-09-14 · Goal: Owner request (no goal) · Status: active (superseded by: —)
Context: Wheel zoom only changed the cell size, so the chart grew or shrank and the stitch under the cursor slid away. The Owner asked for zoom to the cursor, as in Blender.
Decision: Before a zoom, `usePanZoom` records the canvas point under the cursor as fractions of the canvas box. After the renderer's layout effect gives the canvas its new size, a layout effect in the workspace scrolls so that point is back under the cursor, before paint. The wheel and the Zoom tool anchor at the pointer; the zoom buttons anchor at the view's centre.
Rejected: computing the scroll from cell sizes and padding (duplicates the grid-centring layout, which clamps differently when the chart is smaller than the view); a CSS transform zoom (blurs the chart and breaks cell hit-testing).
Consequence: The canvas must be sized in a layout effect declared before the anchor effect. While the chart fits inside the view it stays centred, so the anchor holds only once there is room to scroll.
Evidence: tests/e2e/navigation.spec.ts; app/hooks/use-pan-zoom.ts
