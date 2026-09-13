# D068 · Contour cleanup costs candidates through the shared Crisp-aware lookup
Date: 2026-09-12 · Goal: G-024 M4.5 · Status: active (superseded by: —)
Context: Diagonal-pinch fixes and small-component recoloring could otherwise move a protected cell to an unsupported color.
Decision: A shared admissible-cost map and a plain crispAwareCost function price every candidate. An Infinity for any protected member rejects the whole component's recolor. The contour-refinement entry point throws when given a non-empty Crisp layer.
Rejected: per-call-site cost maps (drift); a special-case branch for protected components (the existing sum rejects them); supporting Crisp inside contour refinement (scope, and not adopted, D055).
Consequence: Components with a protected member move together or not at all. Omitted or empty layers stay byte-identical.
Evidence: lib/pipeline/contour-cleanup.ts; lib/crisp/crisp-evidence-layer.ts; tests/unit/contour-cleanup-crisp.spec.ts; HANDOVER.md D68 as of commit f7bb51c.
