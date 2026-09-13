# D121 · Every view mode draws into one canvas at the same size, so zoom, scroll and pan are shared
Date: 2026-09-13 · Goal: Owner request (no goal) · Status: active (superseded by: —)
Context: The Realistic preview and Original photo were separate images. The photo ignored zoom and the photo's stitch offsets, swapping elements lost the scroll position, and Pan had nothing to grab, so both views drifted out of step with the others.
Decision: All five modes draw into the Image window's one canvas at pattern width × height × cell size. Original photo uses the Grid + photo underlay's placement at full opacity; the realistic preview is rendered to a canvas and drawn scaled to that size. In these two view-only modes only Pan and Zoom act on the canvas.
Rejected: sizing the two images to match the canvas (element swaps still reset scrolling and leave Pan without a target); making the view-only modes editable (edits would be invisible or lag the asynchronous preview).
Consequence: A new view mode must draw into the shared canvas at the same size and say whether it is view-only.
Evidence: tests/e2e/navigation.spec.ts; app/hooks/use-chart-renderer.ts
