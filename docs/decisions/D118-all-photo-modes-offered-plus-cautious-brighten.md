# D118 · All photo modes are offered, plus a cautious Brighten mode, on the Owner's decision
Date: 2026-09-13 · Goal: G-032 · Status: active (superseded by: —)
Context: D117 kept every mode hidden, but the real-photo rule behind it relies on an unvalidated metric. The Owner wants to judge the modes by eye and asked for a cautious fix for dark or flat photos.
Decision: `releasedEnhancementModes()` returns every mode, and a Brighten preset joins them. Brighten stretches levels by at most 1.6× and uses a gamma that only lifts, never leaves the median below where it started, and only runs when levels runs; it has no white balance, CLAHE or vibrance. A photo with deep shadows and highlights (L p0.5 ≤ 0.2, p99.5 ≥ 0.9) is returned untouched, backlit scenes included.
Rejected: keeping modes behind the test-build flag (the Owner can't check them on the live site); turning Auto into the cautious fix (loses the comparison).
Consequence: Release is an Owner decision. The calibration spec asserts safety gates only and reports recovery. An enhancement whose stages all abstain returns the source buffer itself.
Evidence: tests/unit/enhance.spec.ts; tests/unit/enhancement-calibration.spec.ts; docs/reviews/2026-09-13-photo-enhancement-calibration.md
