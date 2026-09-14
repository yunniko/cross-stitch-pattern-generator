# D133 · Large grids: ICM skips unchanged neighbourhoods and k-means caches distances, output identical
Date: 2026-09-14 · Goal: G-035 M5 · Status: active (superseded by: —)
Context: at 1000 stitches, ICM repeated eight full passes of palette scoring and Latest reinvestment recomputed every distance per freed slot; Standard took 13.4–13.7 s.
Decision: ICM caches each undirected pair cost once per call and re-evaluates a cell only when a neighbour's label changed since its last evaluation, inside the unchanged row-major, in-place, 8-pass schedule; reinvestment caches each point's assigned distance; Crisp's weighted k-means runs on flat Float64 columns with the original sum order and RNG draws.
Rejected: restricting ICM candidates to neighbour labels plus the best colour (Codex showed rounding in unary plus pair cost can pick a different tie winner; not needed once the target was met); an independent worklist schedule (changes Gauss-Seidel order).
Consequence: every change must keep toStrictEqual equality with the verbatim pre-M5 copies and the golden hashes unchanged.
Evidence: tests/unit/m5-equivalence.spec.ts; tests/unit/m5-equivalence-adversarial.spec.ts; GOALS.md G-035 progress log
