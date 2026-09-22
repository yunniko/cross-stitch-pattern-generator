# D208 · The preview belongs to every pattern, and each family pays only its own cost
Date: 2026-09-22 · Goal: G-059 · Status: active (superseded by: —)
Context: the preview existed for one pattern of ten, behind a collapsed panel, so a reader chose blind — and it is the only place a pattern shows before a generation is spent.
Decision: it is shown whenever dithering is on, outside the texture panel, for whichever pattern is chosen; clicking it reshuffles the marks, replacing the Shuffle button. What it builds is per family: a matrix needs the window, a kernel the full width down to it, drawn marks the whole grid.
Force: requirement — a preview that is not the chart's own stitches is worse than none (D206), and the families differ in what a corner depends on. Measured: 1–2 ms for a matrix at any size, 3–24 ms for a kernel, 11–539 ms for drawn marks from 200 to 1500 stitches.
Rejected: one rule for all three, which makes every pattern pay the drawn family's price; previewing a capped chart, which is not the reader's.
Consequence: the texture panel holds only what the drawn marks have.
Evidence: tests/unit/dither-texture-swatch.spec.ts
