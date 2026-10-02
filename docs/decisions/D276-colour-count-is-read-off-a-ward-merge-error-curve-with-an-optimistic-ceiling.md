# D276 · The colour count is read off a Ward-merge error curve, with an optimistic ceiling
Date: 2026-10-02 · Goal: G-087 M1 · Status: active (superseded by: —)
Context: a user cannot tell where another colour stops changing what is visible and only spends a thread on shadows.
Decision: cluster the grid's cells into 48 colours in Oklab, merge them Ward-style down to 2, and read three counts where adding one colour lowers a cell's mean error by less than 0.004, 0.0018 and 0.0008; the slider's ceiling is high x 1.35 (at least high + 3, at most 48).
Force: judgment — the thresholds were chosen by eye on the fixtures; a just noticeable difference is about 0.02. The optimistic ceiling is requirement: Owner, 2026-10-02, "Hard ceiling, but be more optimistic".
Rejected: asking the full generation for each count (seconds, not milliseconds); a fixed share of the maximum (ignores the picture).
Consequence: the three gain constants in `predict.rs` are the tuning knobs; a change to them moves every hint, so the review's table is rerun.
Evidence: rust/cs-core/tests/predict.rs; docs/reviews/2026-10-02-colour-prediction.md
