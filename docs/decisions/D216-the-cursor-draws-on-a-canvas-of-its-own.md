# D216 · The cursor's outline is drawn on a canvas of its own
Date: 2026-09-23 · Goal: G-065 M2 · Status: active (superseded by: —)
Context: the brush outline follows the pointer. The chart canvas paints the viewport and is repainted whole (D135), so drawing the outline there would restore a snapshot and repaint on every pointer move — what a shape's rubber band pays during a drag, now paid for idle hovering.
Decision: a second transparent canvas sits over the chart's, on the same painted rectangle, and the outline is cleared and redrawn only there.
Force: requirement — a pointer move must not repaint the chart, asserted through `data-render-revision` in the spec.
Rejected: a CSS box on the cursor (a round stamp is not a rectangle); drawing into the chart canvas (repaints the chart to move a cursor).
Consequence: `main` now holds two canvases, so the chart's is addressed by `data-testid="chart-canvas"`; a spec asking for "the canvas in main" gets two and fails strict mode. The renderer keeps the pointer's screen position, not its stitch, so a scroll or zoom leaves the outline on whatever stitch is under the pointer afterwards.
Evidence: tests/e2e/brush-outline.spec.ts; app/hooks/use-chart-renderer.ts; app/components/image-window.tsx
