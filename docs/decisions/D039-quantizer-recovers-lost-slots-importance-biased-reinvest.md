# D039 · The quantizer refills slots lost to Lloyd attrition and biases reinvestment by importance
Date: 2026-09-11 · Goal: G-020 M1–M3 · Status: active (superseded by: —)
Context: A clustering review found empty k-means clusters silently losing their slot, and worst-fit reinvestment unable to tell a real detail from an artifact. Two comments had also gone stale.
Decision: Compare surviving colors against the requested color count, so attrition and redundancy both reach injectWorstFitClusters. Score worst fit as distance × (1 + 1.0 × importance). Importance is computed before quantization and passed to the quantizer.
Rejected: counting freed slots only from merges (misses attrition); an additive importance bonus or an importance gate (could prioritize near-perfect fits or ignore severe misfits).
Consequence: Injected clusters that attract no cells are dropped, so genuinely scarce images never gain fabricated colors. All-zero importance reproduces the old ranking exactly.
Evidence: lib/pipeline/quantize.ts; tests/unit/quantize.spec.ts; HANDOVER.md D39 as of commit f7bb51c.
