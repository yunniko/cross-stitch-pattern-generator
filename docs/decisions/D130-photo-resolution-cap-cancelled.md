# D130 · The photo resolution cap is cancelled
Date: 2026-09-14 · Goal: G-035 M3 · Status: active (superseded by: —)
Context: no shrink factor or pair-evidence setting passed the quality gates on real photos (D129), and the Owner judged shrinking "questionable but certainly not for automatic work".
Decision: generation always reads the full decoded photo; the cap, the `?compare-resolution` switch and the experimental `pairEvidenceOptions` override are removed, while the worker photo decode (D128) stays.
Rejected: keeping the switch for manual use (the Owner saw no case for it, and it was temporary); a stitch-unit evidence redesign now (it would change every existing result and needs its own goal).
Consequence: G-035's browser generate target of 1.5 s, which assumed the cap, is unreachable; a future cap starts from D129's findings.
Evidence: docs/reviews/2026-09-14-photo-resolution-cap.md; GOALS.md G-035 progress log
