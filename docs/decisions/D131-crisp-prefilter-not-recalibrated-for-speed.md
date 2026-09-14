# D131 · Crisp's candidate pre-filter isn't recalibrated for speed
Date: 2026-09-14 · Goal: G-035 M4 · Status: active (superseded by: —)
Context: the pair-evidence pre-filter (D065) passes 81 % of cells on real photos and 97 % on the noisy 12 MP benchmark, so nearly every cell gets the two-mode fit.
Decision: keep the pre-filter unchanged; M4's speed-up is the identical-output rewrite of the evidence sampling.
Rejected: a neighbour cell-colour range filter (lossless on synthetic fixtures, but on 20 real photos it still passed 76 % of cells and missed 40 confident cells at 100 stitches, and Codex built confident cells with a near-zero range); higher pair-evidence thresholds (more misses on real photos).
Consequence: today's filter already misses about 3 % of confident cells on real photos at 100 stitches, which D065 forbids; a fix must use a provably lossless bound, such as a source-pixel colour range below the 0.02 mode separation, and is an output change for the Owner.
Evidence: docs/reviews/2026-09-14-crisp-prefilter.md; GOALS.md G-035 progress log
