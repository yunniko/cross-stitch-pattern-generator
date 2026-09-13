# D064 · Crisp confidence includes edge sharpness from a step-versus-affine model comparison
Date: 2026-09-12 · Goal: G-024 M4.1 · Status: active (superseded by: —)
Context: Smooth ramps fitting two well-separated modes scored about 0.91 confidence as hard edges (D059, D063).
Decision: Project samples onto the axis between the two modes' spatial centroids. Compare the two-constant step residual with a per-channel weighted linear fit, giving edgeSharpness = affine/(affine + step). Multiply it into confidence and expose boundaryDirection.
Rejected: a higher threshold on the existing two factors (fragile on noisy and antialiased input); the pair-edge tensor as the source (it averages away where the jump is).
Consequence: The known-gap ramp now scores 0.009, while hard edges at every orientation stay accepted. Calibration covers five ramp slopes, a 1–24 px transition-width sweep, checkerboard phases and OKLab-linear ramps.
Evidence: lib/crisp/crisp-edge-evidence.ts; tests/unit/crisp-edge-sharpness-calibration.spec.ts; HANDOVER.md D64 as of commit f7bb51c.
