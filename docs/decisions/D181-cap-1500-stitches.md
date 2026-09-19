# D181 · The chart cap is 1500 stitches per side
Date: 2026-09-19 · Goal: G-046 M4 · Status: active (superseded by: —)
Context: the Owner set the new cap to whatever the measurements support (2026-09-18). With every wall G-046 M1 found now addressed, 1500 and 2000 were measured on the host.
Decision: `MAX_STITCHES` is 1500, and every size check reads it.
Force: requirement — the host measurements: at 2000, three Crisp+ jobs at once take 61–64 s against the 45 s job deadline, and Export all fails because the full-chart PNG's budget (D026) refuses the chart; at 1500 the worst generation mix takes 31 s, three Export alls at once complete inside 2 GiB, and the PNG fits every shape.
Rejected: 2000, which needs a longer job deadline and an Export all without the chart PNG, both the Owner's to decide; about 1550, the square-PNG limit, too thin a margin to be worth an odd number.
Consequence: a larger cap needs, first, a decision on Export all's chart PNG above the budget and on the generation deadline, then these measurements again.
Evidence: docs/reviews/2026-09-19-new-cap-measurements.md; scripts/capacity-probe.ts; scripts/bench-chart.spec.ts
