# D104 · Brush, Move and Select drags redraw only what changed
Date: 2026-09-13 · Goal: G-031 M2 · Status: active (superseded by: —)
Context: every pointer-move in a brush stroke copied and recounted the whole `cellPalette` and repainted every cell; Move and Select did the same via `shiftPattern` / `compositeSelectionPreview` plus a full redraw. On a 1000×625 grid a 50-cell stroke took 21 s (review B7, measured 2026-09-13).
Decision: a brush stroke paints into one working `Uint8Array` and draws just that cell with `drawCell` (fill, symbol, its four gridline segments), committing once on pointer-up through `withCellPalette`; Move and Select snapshot the canvas at pointer-down and blit it back per event, Move with wrap-around copies, Select adding only its own cells and outline. Grid + photo mode keeps the full redraw.
Rejected: throttling the old path with `requestAnimationFrame` — still O(cells) per frame; a second canvas layer for the stroke — no gain over in-place cell redraws.
Consequence: `drawCell` must stay pixel-identical to `drawChart` at that cell (unit-tested for geometry and gridline weights); a change to how a cell is drawn changes both.
Evidence: tests/unit/render-cell.spec.ts; tests/e2e/interaction-correctness.spec.ts (B7 timing, bound 3 s; pre-fix 21,126 ms).
