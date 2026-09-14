# D129 · No default photo cap: pair evidence isn't resolution-invariant
Date: 2026-09-14 · Goal: G-035 M3 · Status: superseded (superseded by: D130)
Context: capping the photo to 8, 4 or 2 px per stitch made generation 6–12× faster but raised stray stitches, because pair-edge evidence (D44) saturates on a shrunk copy and the optimizer stops smoothing.
Decision: ordinary generation keeps the full decoded photo; the cap stays reachable only through the temporary comparison switch, and `pairEvidenceOptions` is an experimental override with D44 defaults when unset.
Rejected: a single recalibrated tau and blur radius (none passed on 21 photos: small values keep stray stitches, large ones over-smooth); tau scaled by native px per stitch (failed on held-out photos at 8 px, and the best constant changed with stitch count); shipping 8 px anyway (confetti p90 +0.08 against a +0.02 gate).
Consequence: a future cap needs evidence defined in stitch units, recalibrated against quality judged directly rather than against Full, whose smoothing itself varies with native resolution.
Evidence: docs/reviews/2026-09-14-photo-resolution-cap.md; commit 9b8de28 (tests removed with the cap, D130)
