# D209 · The colour floor belongs in the palette merge
Date: 2026-09-22 · Goal: G-060 · Status: reverted 2026-09-22 (superseded by: D210)
Context: raising the colour slider stopped changing the chart. On the photo fixture at 150 stitches asking 48: quantizer 48, optimizer and cleanup 40, merge 16.
Decision: `mergeSimilarColors` takes a floor — a colour holding at least that many stitches is never a merge's loser, so the pair is skipped and the loop goes to the next-closest. 0 is off and runs the comparison it always ran. The cell-moving passes are untouched.
Force: requirement — 24 of the 33 lost colours go in the merge, whose merges chain, carrying a cell far past the 0.02 OKLab step that justified each one. A floor in the optimizer would pin a colour's last stitch instead, which is confetti by construction.
Rejected: restoring dropped colours afterwards (rebuilds the confetti those passes removed); a floor in ICM and cleanup (pins single stitches, rewrites every golden hash).
Consequence: the floor reaches only what the cell-moving passes leave. A thread brand can still snap two kept colours onto one skein.
Evidence: docs/reviews/2026-09-22-colour-floor.md (the tests went with the revert; see D210)
