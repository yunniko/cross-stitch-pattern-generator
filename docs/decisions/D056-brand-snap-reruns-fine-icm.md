# D056 · Snapping to a thread palette re-runs the fine ICM pass inside buildPattern
Date: 2026-09-11 · Goal: G-020 M5 · Status: active (superseded by: —)
Context: Boundaries were optimized against continuous colors. After snapping to the coarser DMC palette, some cells sit on the wrong side of the smoothness/color trade-off.
Decision: The brand snap takes an optional reoptimize context and runs runLocalOptimizer against the fixed thread palette using the true cell colors. Threads left with no cells are then dropped. The snap moved from the worker into buildPattern, where cells, importance and pair evidence are still in scope.
Rejected: snap-only post-processing (stale assignments stay; a positive-control fixture proves the correction); snapping in the worker (it lacks the optimizer's inputs).
Consequence: Omitting reoptimize keeps snap-only behavior. The worker re-exports PaletteMode from the pipeline, so the dependency points one way.
Evidence: lib/threads/brand-match.ts; lib/pipeline/pattern.ts; tests/unit/dmc-match.spec.ts; HANDOVER.md D56 as of commit f7bb51c.
