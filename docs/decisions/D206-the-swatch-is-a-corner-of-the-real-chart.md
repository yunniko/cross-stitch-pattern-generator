# D206 · The swatch is a corner of the real chart, at the price of building one
Date: 2026-09-22 · Goal: G-057 · Status: active (superseded by: —)
Context: the swatch built its own 56-stitch field. Marks are placed across the whole grid and their shapes drawn from the same stream afterwards, so both depend on its size: 46% of the swatch's stitches differed from a 200×125 chart's.
Decision: the swatch builds the field at the chart's own size and shows its top-left corner over a dark-to-light ramp, by `ditherToPalette`'s own rule. It redraws 120 ms after the sliders stop.
Force: requirement — while shapes come from the stream after placement, no window can be built without the whole grid. Measured: 14 ms at 200 stitches, 30 at 400, 200 at 1000, 494 at 1500; hence the pause.
Rejected: keeping the cheap swatch (it showed a pattern no chart draws); drawing shapes from a per-mark hash, which would make a window cheap but changes every chart drawn so far.
Consequence: comparing a tone with a threshold is the pipeline's rule only while the dark thread is nearer; in the light half the marks invert.
Evidence: tests/unit/dither-texture-swatch.spec.ts
