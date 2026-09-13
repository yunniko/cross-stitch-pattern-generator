# D114 · Enhancement steps are capped and target-seeking, with guards against false white balance and clipped tails
Date: 2026-09-13 · Goal: G-032 M1 · Status: active (superseded by: —)
Context: Both reviews found the plan's tone targets and guards unsafe. Unit tests then showed a flat beige surface being "corrected", a stretch clipping tails to pure black and white, and repeated passes drifting.
Decision: White balance uses capped, partial shades-of-grey (p = 6) on near-neutral samples spanning ≥ 0.15 lightness, with the chroma cap checked after normalization. Levels skip when L p0.5 ≤ 0.2 and p99.5 ≥ 0.9, stretch toward 0.1–0.95 with a centred cap, and use a toe and shoulder, not a clip. Gamma moves the median into [0.50, 0.64]; the composed slope stays ≤ 3. CLAHE's flatness gate scales blend to zero.
Rejected: a 0.45–0.5 midtone target (darkens normal photos); a 0.05/0.95 deadband (stretches nearly every photo); exact idempotence (capped steps converge over passes by design).
Consequence: The idempotence criterion is convergence: each further pass must change the image less. Constants are starting points for M2/M4 calibration.
Evidence: tests/unit/enhance.spec.ts; lib/pipeline/enhance.ts; docs/domain-reference-photo-enhancement.md
