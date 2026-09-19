# D172 · Raster exports stamp symbols from tiles drawn once per colour
Date: 2026-09-19 · Goal: G-047 M1 · Status: active (superseded by: —)
Context: text rasterisation was about three quarters of the chart PNG's drawing (5.6 of 7.7 s at 1000 stitches), one `fillText` per stitch for a handful of distinct glyphs.
Decision: the chart PNGs and A4 pages draw each palette entry's symbol once onto a padded transparent tile and `drawImage` it per stitch (`symbolStampsFor` in `lib/export/render.ts`).
Force: requirement — the Owner's acceptance of a ±1 pixel difference (2026-09-19); stamping differs from `fillText` by at most 1 in anti-aliased edge bytes.
Rejected: keeping `fillText` everywhere (byte-identical, twice the time); stamps in the PDF, whose symbols Pattern Keeper must read as text; stamps on screen, which the frozen parity specs pin.
Consequence: stamps are passed only with a real canvas context. The tile's pad is measured from every glyph's bounds, so a new symbol cannot be clipped.
Evidence: tests/unit/symbol-stamps.spec.ts; GOALS.md, G-047 progress log, 2026-09-19
