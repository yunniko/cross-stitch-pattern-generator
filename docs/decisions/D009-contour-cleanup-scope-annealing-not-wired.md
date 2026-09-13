# D009 · Contour cleanup ships diagonal fixes and component recoloring; simulated annealing stays unwired
Date: 2026-09-09 · Goal: G-001 M7 · Status: active (superseded by: —)
Context: The spec's cleanup phase listed diagonal fixes, hole removal, jaggy regularization, banding detection, multi-cell moves and optional annealing.
Decision: Wire fixDiagonalConnections and recolorSmallComponents into buildPattern. Drop palette entries left with zero cells before symbols are assigned. Keep simulated annealing built and tested, but not called.
Rejected: a separate one-cell hole pass (ICM already resolves it); jaggy and banding passes (need contour extraction, with unclear payoff); annealing by default (no demonstrated need, adds a schedule to tune).
Consequence: Component recoloring builds its member index in one pass; a per-component rescan was quadratic and hung at 1000 stitches. Simulated annealing now lives in lib/experimental/ (G-031 M4).
Evidence: lib/pipeline/contour-cleanup.ts; lib/experimental/simulated-annealing.ts; tests/unit/pattern.spec.ts; HANDOVER.md D9 as of commit f7bb51c.
