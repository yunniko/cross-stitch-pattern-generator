# D117 · No enhancement mode is released: on real photos it widens tone but doesn't improve pattern structure
Date: 2026-09-13 · Goal: G-032 M4 · Status: active (superseded by: —)
Context: D115 moved the release decision to real photos. A five-clause rule was fixed before measuring 13 CC0 photos, including one real under/normal exposure pair.
Decision: Release nothing; the feature stays hidden (Off only) pending the Owner's call. No mode passed: every mode failed do-no-harm (mountain lake 0.87 vs 0.90), benefit (real recovery at most +0.015 vs 0.03), and near-duplicate shades (e.g. backlit tower 6 → 12 pairs). Only Portrait widened tonal range on enough flawed photos.
Rejected: re-tuning presets against these same photos until they pass (no held-out set; fits the test); releasing modes as experimental without Owner approval (ships output that failed its own quality gates).
Consequence: Enhancement code, preview and UI stay in the build behind the release list. Releasing requires either a tuning round validated on a held-out photo set or an explicit Owner decision.
Evidence: docs/reviews/2026-09-13-photo-enhancement-calibration.md; scripts/calibrate-enhancement.ts
