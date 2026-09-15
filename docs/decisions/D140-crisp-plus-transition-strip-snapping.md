# D140 · Crisp+ snaps thin blend strips that the source confirms as a blurred edge
Date: 2026-09-16 · Goal: G-038 M2 · Status: active (superseded by: —)
Context: After D139, edges blurred by half a cell or more still leave runs of in-between colours that no evidence claims.
Decision: A Crisp+ pass after the palette merge, before compaction and finalization, snaps a run of at most 5 cells between two 3-cell side runs, with colours within 0.25 of the linear-light side line. It snaps only when the source profile fits a logistic better than a ramp (sharpness ≥ 0.75) and three flat levels don't fit much better. Each cell takes the side of the fitted centre. Freed palette slots stay free.
Rejected: colour-only snapping (erases real lines); tolerance 0.35 (206–283 blend cells at blur 1 with 16 colours); 2-cell sides (gradient cells relabelled); sharpness 0.65 (38 relabelled).
Consequence: Blend colours at blur 1 whose colour mixes three regions stay; M3 decides pruning. Snapping reads labels as they were before each pass.
Evidence: lib/crisp/transition-snap.ts; tests/unit/transition-snap.spec.ts; tests/unit/crisp-plus-snap-sweep.spec.ts; docs/reviews/2026-09-16-crisp-plus-calibration.md
