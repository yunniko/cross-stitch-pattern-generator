# D112 · Enhancement runs inside buildPattern; color stages read the enhanced photo, edge stages the original
Date: 2026-09-13 · Goal: G-032 M1 · Status: active (superseded by: —)
Context: Enhancing only cells would leave source-reading stages on original colors. Both reviews warned that local contrast or a big stretch lifts flat-region noise above the absolute Sobel floor, weakening confetti suppression.
Decision: buildPattern calls enhancement once, before its source processing; the worker only forwards the mode. Off is a true bypass: the original buffer object reaches the pipeline untouched. Downsampling and Crisp's two-color fits read the enhanced buffer. Sobel importance and pair-edge evidence read the original, so their calibrated floors stay valid.
Rejected: enhancing the cell grid (inconsistent colors); edge stages on enhanced pixels (predicted noise-floor damage); scaling NOISE_FLOOR by tone gain (a new calibration with no data yet).
Consequence: The split is a first-calibration prior, not a full answer: enhanced colors still shift the ICM balance and denoise thresholds. Crisp candidate selection needs its own recall check against fits on the enhanced photo; if that fails, candidates use enhanced pair evidence (Codex round 2).
Evidence: lib/pipeline/enhance.ts; docs/domain-reference-photo-enhancement.md
