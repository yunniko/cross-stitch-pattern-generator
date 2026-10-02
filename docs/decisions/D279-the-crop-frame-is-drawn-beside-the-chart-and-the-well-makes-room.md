# D279 · The crop frame is drawn beside the chart's frame, and the well makes room while the tool is open
Date: 2026-10-03 · Goal: G-089 · Status: active (superseded by: —)
Context: the chart's frame clips what it holds, so a frame that grows the chart cannot be drawn inside it.
Decision: the overlay is a sibling of the chart's frame in a wrapper, as plain elements with pointer handles; while the tool is open the well's padding is 120 px so there is room to drag outward.
Force: judgment — the canvas overlay the cursor uses is chart-sized and clips the same way; elements give focusable, keyboard-movable handles for free.
Rejected: drawing on the cursor's canvas (clips at the chart); a larger chart canvas (repaints the chart for a gesture).
Consequence: the chart's frame is no longer the scroller's direct child; a spec that scrolled by its offsets now measures from bounding boxes. Growing further than the room is by typing or zooming out.
Evidence: tests/e2e/crop-tool.spec.ts; tests/e2e/backstitch-edit.spec.ts
