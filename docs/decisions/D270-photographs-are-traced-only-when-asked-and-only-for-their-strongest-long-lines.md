# D270 · Photographs are traced only when asked, and only for their strongest long lines
Date: 2026-10-02 · Goal: G-084 · Status: active (superseded by: —)
Context: D267 refuses any picture that is not mostly flat, so a drawing-like image with texture, or a photograph with a branch in it, got nothing.
Decision: a checkbox "Also in photographs" lets the tracing run on such a picture with a stricter profile: a higher strength threshold, lines of at least about seven stitches, and the longest strongest lines kept up to four cells per row of stitches.
Force: requirement — Owner, 2026-10-02: add running on photographs. The profile numbers are judgment, read from three photographs.
Rejected: tracing photographs by default (D267 stands); the drawing's profile with a budget only (photograph texture still passed it at low sensitivity).
Consequence: with it off nothing changes. With it on a photograph gets few lines, often none; thin things one stitch thick or thicker are not found.
Evidence: docs/reviews/2026-10-02-backstitch-from-lines.md; rust/cs-core/tests/backstitch_lines.rs
