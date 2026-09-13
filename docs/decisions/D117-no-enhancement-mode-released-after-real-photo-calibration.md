# D117 · No enhancement mode is released: no evidence of benefit, and the gates can't yet detect harm
Date: 2026-09-13 · Goal: G-032 M4 · Status: superseded (superseded by: D118)
Context: D115 moved the release decision to real photos. A five-clause rule was fixed before measuring 13 CC0 photos; the only under/normal pair is an edit of a single capture.
Decision: Release nothing; production offers Off only until the Owner decides. No mode showed benefit (tree recovery at most +0.015 against 0.03; synthetic about zero). The failures of the do-no-harm and near-duplicate clauses aren't proof of harm: a +1 code-value change alone scores 0.883 on the lake, where modes scored 0.866–0.872.
Rejected: tuning presets on these same photos (no held-out set); releasing as experimental without Owner approval (benefit unshown); concluding enhancement is useless (the metric has no validated floor or chance correction).
Consequence: A release needs a validated metric, a held-out set with expert references, or an explicit Owner decision. The code, preview and UI stay behind `releasedEnhancementModes()`.
Evidence: docs/reviews/2026-09-13-photo-enhancement-calibration.md; scripts/calibrate-enhancement.ts
