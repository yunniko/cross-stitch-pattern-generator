# D045 · The coarse pass's edgeLoss is 0.015; other multi-scale weights stay unchanged
Date: 2026-09-11 · Goal: G-022 M4 · Status: active (superseded by: —)
Context: The new stencil (D043) and edge evidence (D044) changed what boundary cost measures, so the multi-scale weights needed reassessment.
Decision: Raise DEFAULT_MULTI_SCALE_WEIGHTS.coarse.edgeLoss from 0.01 to 0.015, leaving fine edgeLoss 0.05 and both smoothness values as they were.
Rejected: lowering coarse smoothness (more confetti, since the coarse pass establishes region structure); eleven other candidates (none beat the existing constants).
Consequence: Noisy-fixture confetti was never worse, and improved at 3 of 5 color counts. Close-color diagonal IoU dipped 0.4 %, and the D018 cat's eyes were unchanged. A regression test pins confetti at or below the pre-change values.
Evidence: lib/pipeline/local-optimizer.ts; tests/unit/regression.spec.ts; HANDOVER.md D45 as of commit f7bb51c.
