# D256 · Each distinct letter is drawn once and placed at a whole stitch
Date: 2026-10-01 · Goal: G-081 M5 · Status: active (superseded by: —)
Context: drawing a line in one canvas call put every letter at a fractional x, so the cut at a coverage threshold rounded the same letter differently each time ("nnnn" gave three shapes).
Decision: `letteringCells` draws each distinct character once at a whole pixel and stamps that picture at the rounded pen position of each occurrence.
Force: judgment — the Owner asked why identical letters differ and chose to fix it; same-looking letters read better, but nothing external compels the method.
Rejected: drawing the line in one call and accepting the variation (the problem itself); hinting or font-specific rounding (not available in the browser canvas).
Consequence: kerning pairs are not applied and gaps vary by one stitch with the font's fractional advances; a letter overhanging its neighbour is clipped only at the piece's edge. Spacing control, if added, works on pen positions.
Evidence: tests/unit/text-raster.spec.ts (the same letter is the same stitches); commit in G-081 M5
