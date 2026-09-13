# D031 · DMC matching is a post-process over a finished pattern; floss is estimated generously
Date: 2026-09-10 · Goal: G-013 · Status: partly superseded (superseded by: D040, D092)
Context: The Owner wanted palettes snapped to real, buyable DMC floss named "CODE - name", with a per-color floss estimate that errs toward too much.
Decision: Snap each finished palette color to its nearest DMC thread by OKLab distance and merge colors that land on the same code. DMC data is re-derived from an MIT dataset. Skeins = stitches × strands × 2(√2+1) × 2.54 × K / count / 4800, with K = 2.0, rounded up.
Rejected: a DMC-specific clustering algorithm (would touch the tested core pipeline); 800 cm of usable thread per skein (a common error: 8 m is the six-strand bundle, 4,800 strand-cm); K ≈ 1.5 (fits contiguous stitching, not photo confetti).
Consequence: Brand logic stays outside buildPattern's clustering. D040 made DMC a palette mode and D092 generalized it to other brands.
Evidence: lib/threads/floss-estimate.ts; docs/domain-reference-floss-estimate.md; docs/dmc-colors-provenance.md; tests/unit/floss-estimate.spec.ts; HANDOVER.md D31 as of commit f7bb51c.
