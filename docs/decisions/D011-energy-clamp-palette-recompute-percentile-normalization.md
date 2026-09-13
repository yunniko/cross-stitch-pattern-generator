# D011 · Second domain review: clamp the pair energy, recompute palette colors, normalize edges at the 99.9th percentile
Date: 2026-09-09 · Goal: G-001 M8 · Status: active (superseded by: —)
Context: A review of the new optimizer found the fine pass's coupling went negative above edge ≈ 0.474, stale k-means palette colors, an asymmetric energy, and max-normalized importance.
Decision: Pair cost is max(0, smoothness·(1−edge) − edgeLoss·edge), charged only on mismatches, from one shared energy function. Palette colors are recomputed as the linear-light mean of their final cells. Importance is normalized at the 99.9th percentile above a noise floor. Diagonal fixes skip important pinches and costly recolors.
Rejected: squaring the edge discount (confetti rose from 0.96 % to 17.1 %); the 98th percentile (same regression on noisy photos).
Consequence: Every fix is re-measured on deterministic fixtures, because both wrong versions passed all unit tests. Isoluminant edges, color-term weight and importance-weighted k-means were deferred.
Evidence: lib/pipeline/energy.ts; lib/pipeline/edge-map.ts; docs/domain-reference.md; HANDOVER.md D11 as of commit f7bb51c.
