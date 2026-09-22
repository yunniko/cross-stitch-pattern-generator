# D207 · Switches let the knobs reach every mark, and the size knob is read backwards
Date: 2026-09-22 · Goal: G-058 · Status: active (superseded by: —)
Context: of five texture knobs only Mark spacing touched every shape; three touched the rings, one the lumps. That was the main limit on the textures reachable.
Decision: three optional booleans — wobble, size and sweep "every mark" — absent meaning off, each adding a term so that with all three off every branch is what it was. The panel shows Ring thickness: the stored radius, read backwards.
Force: requirement both ways. The knobs are read inside the scoring function, so widening them without a switch changes every existing texture and breaks D202; and tone fixes how many stitches a mark lights, so a wider circle spreads the thread thinner — a slider named thickness must lower the radius as it rises.
Rejected: widening the knobs and re-baselining the frozen default (the Owner chose neutral defaults); a dot core spilling by distance — a monotone rewrite of distance, measured as changing nothing.
Consequence: the size switch packs a mark rather than enlarging it (−45% reach), because the ink is fixed.
Evidence: tests/unit/dither-every-mark.spec.ts
