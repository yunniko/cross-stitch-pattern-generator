# D052 · Boundary chains are ordered lattice-edge walks that end at junctions
Date: 2026-09-11 · Goal: G-022 M5.3 · Status: active (superseded by: —)
Context: Candidate ranking and multi-cell moves needed an ordered representation of region boundaries, which labelRegions doesn't provide.
Decision: Treat the grid as a (width+1)×(height+1) vertex lattice, group unit edges between differently labeled 4-neighbors by region pair, and walk them into chains. A vertex where 3 or more regions meet is a junction and always ends a chain. Fully enclosed boundaries become closed chains.
Rejected: walking through junctions and annotating them (moves would have to re-derive junction safety); storing chains on StitchPattern (derived, transient structure).
Consequence: A chain's endpoints are the limit of what a boundary move may touch. The module now lives in lib/experimental/ because nothing in the default pipeline calls it.
Evidence: lib/experimental/boundary-chains.ts; tests/unit/boundary-chains.spec.ts; HANDOVER.md D52 as of commit f7bb51c.
