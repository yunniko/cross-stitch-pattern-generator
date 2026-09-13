# D071 · Brand snapping rebuilds Crisp mode mappings against thread colors and repairs, even without re-optimization
Date: 2026-09-12 · Goal: G-024 M4.8 · Status: active (superseded by: —)
Context: Snapping to thread colors can leave protected cells on unsupported labels, including when optimize is off and ICM never runs.
Decision: Build mode-to-label mappings against the deduplicated thread palette and repair right after the snap and merge, whether or not reoptimize is given. Pass the layer into the reoptimize ICM call too. Count mode collisions onto one thread as a diagnostic.
Rejected: recomputing thread RGB after repair (thread colors are fixed references); a thread-allocation policy that reassigns colliding modes (a separate, unbuilt decision); repairing only inside the reoptimize path.
Consequence: Two modes on one thread resolve by the minimum-cost rule, and no unrelated label is admitted. Repair tests need a mechanical group with zero supporting modes to exercise the path.
Evidence: lib/threads/brand-match.ts; tests/unit/dmc-match-crisp.spec.ts; HANDOVER.md D71 as of commit f7bb51c.
