# D267 · Only a mostly flat picture is traced
Date: 2026-10-02 · Goal: G-084 · Status: active (superseded by: —)
Context: the tracing found 2,235 lines in a textured photograph; the app is for wide use and a photograph must not get worse.
Decision: lines are traced only when at least 55 % of the picture is flat (8 x 8 blocks of it reduced to 512 pixels, luminance standard deviation under 6), and never more than 25 cells of line per row of stitches.
Force: requirement — Owner, 2026-10-02: it is for wide use, so the default must be safe on photographs; the 55 % itself is judgment, read off the measurements.
Rejected: a density limit alone (photographs and drawings overlap at low sensitivity); a per-cell flatness test (it changed with the stitch count).
Consequence: a drawing on a textured ground is refused. Revisit the 55 % if scanned drawings are refused.
Evidence: docs/reviews/2026-10-02-backstitch-from-lines.md; rust/cs-core/src/lines.rs
