# D212 · A thread for a hue the photo has
Date: 2026-09-23 · Goal: G-062 · Status: active (superseded by: —)
Context: four mechanisms failed to get a visible colour into a chart (D209–D211), all the same way: the cat's pink is 0.5% of the chart, so allocating by squared error treats it as a rounding error.
Decision: under Vivid, each hue bin the cells hold above chroma 0.02 that no thread speaks for takes a slot, paid for by merging the closest pair and seeded at the bin's most colourful cell; cells are assigned once. A thread's colour becomes mean lightness with its most colourful quarter's chroma. At most 6; Crisp keeps its own palette stage.
Force: requirement — cells are assigned **once** because re-converging Lloyd loses every reserved hue, its centroid drifting back into the mass it escaped. A thread speaks for a hue only above chroma 0.03 *and* half the bin's best cell, or a near-neutral covers pink and it vanishes as the palette grows.
Rejected: chroma-ranked allocation; hue-weighted clustering; a merge floor.
Consequence: the lattice's red arrives at 20 colours instead of 64, the cat's pink at 16 instead of never.
Evidence: tests/unit/hue-reserve.spec.ts; docs/reviews/2026-09-22-vivid.md
