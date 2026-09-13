# D059 · Crisp coverage sums each pixel's true overlap with the cell
Date: 2026-09-11 · Goal: G-024 M3 planning · Status: active (superseded by: —)
Context: A Codex critique of the M3 plan found that evidence coverage used a binary pixel-center test with neighborhood weights, so boundary pixels were over-counted or dropped.
Decision: Compute an independent fractional cell-overlap weight per pixel and sum it into coverage, with no binary gate.
Rejected: the center-in-cell test (a 5-pixel reproduction returned 0 %/100 % instead of 20 %/80 %); building weighted training first (correct training can't fix wrong coverage).
Consequence: Steeper gradients (16–32 px periods) still scored confidence 0.94–0.98, a structural false positive recorded as a known-gap test and required to be fixed before confidence gates labels (done in D064).
Evidence: tests/unit/crisp-edge-evidence.spec.ts; lib/crisp/crisp-edge-evidence.ts; HANDOVER.md D59 as of commit f7bb51c.
