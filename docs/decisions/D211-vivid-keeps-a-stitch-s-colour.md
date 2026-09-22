# D211 · Vivid keeps a stitch's colour
Date: 2026-09-23 · Goal: G-061 · Status: active (superseded by: —)
Context: a photo's reds and blues come back as browns. A stitch is its pixels' average, so the colour is gone before any palette is chosen: the lattice photo's cells hold 39 red stitches of 8000.
Decision: a **Vivid** switch beside Algorithm. On, a cell keeps its area-mean lightness and takes the chroma of its most colourful quarter, gamut-mapped not clipped. Off is byte-identical. It stands down below 24 pixels a cell, and a chart records it only when it acted.
Force: requirement — at ~4 pixels a cell the chroma from noise alone reaches 0.127, above the 0.03–0.04 real colour gives at 144–400, so no threshold on the gain separates them; ungated it cost 121× the error on `flat regions`.
Rejected: a third Algorithm value (D040 — that enum is the quantizer, this is what it reads); a threshold on the gain; changing the denoise too.
Consequence: it does **not** deliver the complaint it was built for; the Owner shipped it to try. Photo fix keeps its own Vivid for now.
Evidence: tests/unit/vivid.spec.ts; docs/reviews/2026-09-22-vivid.md
