# D115 · Release gates compare pattern structure; synthetic fixtures show no harm but not benefit, so nothing is released yet
Date: 2026-09-13 · Goal: G-032 M2 · Status: active (superseded by: —)
Context: D113 requires each mode to pass recovery, do-no-harm, noise and thread gates before release. The first run judged agreement by exact cell colour (ΔE 0.06); even undegraded photos then agreed with Off on only 8–51% of cells, measuring intended tone change rather than harm.
Decision: Gate recovery and do-no-harm on boundary agreement: whether neighbouring cells share a colour in both patterns. Thresholds were unchanged. All modes pass recovery (0.93–0.98), do-no-harm (0.92–0.98), noise (no confetti rise, Standard or Crisp) and threads (7–9 versus 6, ≤ 1 extra near-duplicate pair). None beats Off by 0.05: degraded copies already agree 0.95–0.98. RELEASED_ENHANCEMENT_MODES stays Off only; M4 decides releases on real photos.
Rejected: lowering the gain gate or strengthening degradation until a mode wins (fitting the test to the result).
Consequence: CLAHE clip 1.8/2.5 stays: no confetti evidence against it. White balance abstained on every degraded fixture, as its guards intend.
Evidence: tests/unit/enhancement-calibration.spec.ts; docs/domain-reference-photo-enhancement.md
