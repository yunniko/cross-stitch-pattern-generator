# D132 · Crisp evaluates every cell; the pair-evidence pre-filter is removed
Date: 2026-09-14 · Goal: G-035 M4 · Status: active (superseded by: —)
Context: the pre-filter (pair evidence ≥ 0.05, D065) dropped about 3 % of confident boundary cells on real photos at 100 stitches, which D065 itself forbids, while still passing 77–81 % of cells (D131).
Decision: the Crisp evidence layer evaluates every cell, and `candidateCellsFromPairEvidence` with its threshold is deleted; pair evidence is still computed exactly as before, so only the confident set changes. Approved by the Owner at the M4 check-in.
Rejected: keeping the filter (known silent recall loss); a cell-colour range or higher threshold (lossy on real photos, D131); a source-pixel range bound (lossless but would pass nearly every textured cell for its extra cost).
Consequence: Crisp output changes only where the filter missed a confident cell; no golden fixture hit such a miss, so the golden hashes are unchanged. Evaluating every cell cost 0.3–1.1 s per 4000 px photo.
Evidence: docs/reviews/2026-09-14-crisp-prefilter.md; tests/unit/golden-hashes.spec.ts
