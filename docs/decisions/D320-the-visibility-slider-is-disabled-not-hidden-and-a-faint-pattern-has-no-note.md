# D320 · The visibility slider is disabled, not hidden, and a faint pattern has no note
Date: 2026-10-06 · Goal: G-110 (after M4, at the Owner's live review) · Status: active (superseded by: —)
Context: the slider appeared only with the photo on, and below 5 % visibility Edit showed "Too faint to edit: raise the pattern to 5 % or more."
Decision: the slider is shown wherever Photo is, disabled with its reason while the photo is not under the pattern; below 5 % no note is shown, and editing stays blocked there.
Force: requirement — the Owner's instructions of 2026-10-06 ("remove this"; "lock it when unavailable, but not hide"; keep the 5 % block, asked and answered).
Rejected: dropping the 5 % block with the note (the Owner chose to keep it); hiding the slider while unusable (G-110 M3's form, replaced at the Owner's word).
Consequence: Stitched keeps its note. With Photo Hidden as a feature, the slider is absent with it, as G-102 makes Hidden mean.
Evidence: tests/e2e/view-switches.spec.ts; tests/unit/view.spec.ts
