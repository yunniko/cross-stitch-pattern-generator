# D069 · After a palette change, only inadmissible Crisp labels are repaired, by the shared argmin rule
Date: 2026-09-12 · Goal: G-024 M4.6 · Status: active (superseded by: —)
Context: A palette merge's mechanical remap can leave a protected cell on a label none of its modes supports. The D063 counterexample (grays 100/105/94/255) reproduces this with the real merge code.
Decision: repairCrispAssignments keeps a protected cell's label if it is still admissible, and otherwise picks the best admissible label with the same pickBestAdmissibleLabel used at initialization.
Rejected: re-mapping every protected cell to its global best (moves cells that are still supported); a second selection rule for repair (drift).
Consequence: Repair is generic over why the palette changed, so merges and brand snaps share it. Non-Crisp cells are never touched.
Evidence: lib/crisp/crisp-evidence-layer.ts; lib/crisp/crisp-unary-cost.ts; tests/unit/crisp-evidence-layer-repair.spec.ts; HANDOVER.md D69 as of commit f7bb51c.
