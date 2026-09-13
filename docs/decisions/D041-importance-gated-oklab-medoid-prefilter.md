# D041 · Quantizer input is pre-filtered by an importance-gated 3×3 OKLab vector medoid
Date: 2026-09-11 · Goal: G-020 M4 · Status: partly superseded (superseded by: D051)
Context: Box-averaged cells in flat regions still carry residual noise, which becomes extra palette entries and confetti.
Decision: Each cell with importance below 0.5 is replaced by the member of its 3×3 window with the smallest total squared OKLab distance to the others, keeping itself on ties. Only the quantizer sees the filtered buffer.
Rejected: a bilateral blend (shifts every cell, can invent colors, adds two sigmas to tune).
Consequence: The optimizer, palette recompute and edge evidence keep using the true cell colors. A 1:1 noisy fixture regressed slightly (confetti 0.0142 to 0.0158, still inside its band), while representative fixtures improved. D051 later protected thin axial lines.
Evidence: lib/pipeline/denoise.ts; tests/unit/denoise.spec.ts; tests/unit/regression.spec.ts; HANDOVER.md D41 as of commit f7bb51c.
