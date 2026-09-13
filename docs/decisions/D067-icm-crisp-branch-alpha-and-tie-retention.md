# D067 · In ICM, protected cells search only admissible labels, with α from weights.color, and keep their label on ties
Date: 2026-09-12 · Goal: G-024 M4.4 · Status: active (superseded by: —)
Context: ICM had to respect Crisp admissibility without changing Standard cells or double-scaling the already α-weighted cost.
Decision: Precompute admissible costs once per call with α = weights.color. Evaluate a protected cell's current label first and replace it only on strictly lower energy. Keep the boundary-energy loop inline in both branches.
Rejected: applying weights.color to the Crisp cost (double scaling); ascending-label tie-breaking for protected cells (erases deliberate initialization); a shared closure for the two branches (D044's measured 3× slowdown).
Consequence: An omitted or empty layer is byte-identical to Standard. A confident black/white cell surrounded by gray never becomes gray.
Evidence: lib/pipeline/local-optimizer.ts; tests/unit/local-optimizer-crisp.spec.ts; HANDOVER.md D67 as of commit f7bb51c.
