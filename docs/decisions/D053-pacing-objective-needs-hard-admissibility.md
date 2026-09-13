# D053 · The pacing objective is worth building, but only with corner and junction admissibility
Date: 2026-09-11 · Goal: G-022 M5.4 · Status: active (superseded by: —)
Context: Before building a refinement pass, a cheap experiment tested whether the pacing score ranks hand-made candidates correctly.
Decision: Continue to M5.5 on the condition that pacing is never evaluated across a known corner or junction, and junction neighborhoods are frozen.
Rejected: relying on existing energy (well- and badly-paced boundaries differ only 8.4 %, and a junction split costs 3.558 versus 3.521); scoring across corners (a correct 90° corner shows a false discrepancy above 0.45).
Consequence: Admissibility constraints are a hard requirement for any contour-refinement design, not a later refinement.
Evidence: tests/unit/m5.4-candidate-ranking.spec.ts; tests/unit/contour-pacing.ts; HANDOVER.md D53 as of commit f7bb51c.
