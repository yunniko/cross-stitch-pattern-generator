# D201 · Drawn marks are a third dither family, and hold tone by construction
Date: 2026-09-21 · Goal: G-054 M1 · Status: active (superseded by: —)
Context: the Owner asked for a chart that reads as hand-drawn. A matrix repeats, so its marks sit on a lattice; a kernel has no notion of a mark.
Decision: a third family, beside the matrices (D198) and kernels (D200). Centres scatter on a jittered lattice with a minimum separation, each cell joins its nearest centre, and a mark's cells are ranked by how early its shape reaches them, then spread evenly over 0..1.
Force: requirement — that even spread is what makes tone exact. A flat tone `t` lights exactly `t` of every mark, so marks choose which stitches, never how many: within 0.02 at five tones; over a 5×5 it is no worse than undithered on three fixtures. A new shape keeps that ranking, or tone drifts.
Rejected: a large matrix (repeats, only further apart); stamping marks on afterwards (nothing then holds tone).
Consequence: a shape is a score function, not a pass. The field is per chart: 5.6 s at 1500 stitches, under the undithered 11.9 s.
Evidence: tests/unit/dither-hand-drawn.spec.ts; docs/reviews/2026-09-21-hand-drawn-samples.md
