# D066 · Confident Crisp cells start at the argmin of unary cost against the returned palette
Date: 2026-09-12 · Goal: G-024 M4.3 · Status: active (superseded by: —)
Context: After weighted quantization, each confident boundary cell needs an initial label before ICM.
Decision: Pool samples from the frozen layer: two coverage-weighted modes per confident cell, one weight-1 color otherwise. Other cells take the quantizer's label. A confident cell takes the lowest admissible unary cost, evaluated against the returned RGB palette converted back to OKLab.
Rejected: larger coverage wins (a 60 % mode with poor palette fit should lose to a 40 % exact match); scoring against internal training centroids (not authoritative after RGB rounding and merging).
Consequence: An empty evidence layer reproduces the Standard quantizers byte-for-byte.
Evidence: lib/crisp/crisp-quantization-stage.ts; tests/unit/crisp-quantization-stage.spec.ts; HANDOVER.md D66 as of commit f7bb51c.
