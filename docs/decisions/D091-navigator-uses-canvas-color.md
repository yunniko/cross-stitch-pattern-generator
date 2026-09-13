# D091 · The navigator preview draws empty cells in the canvas color
Date: 2026-09-12 · Goal: Owner request · Status: active (superseded by: —)
Context: After D087 the main canvas used the canvas color for empty cells but the navigator still drew white.
Decision: renderNavigatorPixels takes a trailing emptyCellColor defaulting to white, and its only caller passes the canvas color.
Rejected: a separate navigator color setting (the two views should agree).
Consequence: The navigator has no export call site, so no export boundary is involved. Both canvases read back byte-identical empty-cell pixels.
Evidence: tests/unit/navigator-pixels.spec.ts; lib/export/render.ts; HANDOVER.md D91 as of commit f7bb51c.
