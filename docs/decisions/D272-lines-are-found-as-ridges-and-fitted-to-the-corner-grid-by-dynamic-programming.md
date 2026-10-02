# D272 · Lines are found as ridges and fitted to the corner grid by dynamic programming
Date: 2026-10-02 · Goal: G-084 · Status: active (superseded by: —)
Context: the first tracing was wavy, pale and ran on a reduced picture (Owner, 2026-10-02: run it on the full-size photograph, draw closer to the shape, review the whole algorithm).
Decision: lines are Steger ridges (Gaussian derivatives per colour channel, sub-pixel centreline, flank test) on a picture reduced only to 20 pixels a stitch and 3 million pixels, linked into chains, and fitted by dynamic programming to stitches of at most three cells that stay within 0.7 cell and turn least; the colour is read from the original pixels.
Force: requirement — the Owner asked for closeness to the shape without waviness, no loss of detail or colour. The constants are judgment, read from pictures.
Rejected: top-hat and thinning (stairs, crumbs); Frangi, Hough, LSD, Potrace (see the review).
Consequence: the scale of the ridge strength changed, so every threshold was re-read (D267, D270). A 27-megapixel picture takes about 5 s more. Supersedes D268's procedure, not its three-cell limit.
Evidence: docs/reviews/2026-10-02-backstitch-from-lines.md; rust/cs-core/src/lines.rs
