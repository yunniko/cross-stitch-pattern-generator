# D065 · One frozen Crisp evidence layer, pre-filtered by pair evidence and confirmed by a confident neighbor
Date: 2026-09-12 · Goal: G-024 M4.2 · Status: partly superseded (superseded by: D132 for the pre-filter)
Context: Every downstream Crisp stage needs the same accept/reject decision per cell, and fitting two-means on every cell of a large grid is costly.
Decision: Evaluate boundary evidence once for cells whose pair evidence exceeds 0.05, keep cells above the confidence threshold, and accept a cell only when at least one 8-connected neighbor is also confident. The Original/Latest choice maps to the matching weighted quantizer. A custom quantizer throws.
Rejected: re-deriving confidence per stage (drift, as in D011); a strict pre-filter (a missed candidate silently disables Crisp on a real boundary); silently using one weighted quantizer (turns Original + Crisp into Latest).
Consequence: Pre-filter recall is verified against a full per-cell evaluation. Any nonzero neighborhood margin leaks at least one pixel into neighbors' windows.
Evidence: lib/crisp/crisp-evidence-layer.ts; tests/unit/crisp-evidence-layer.spec.ts; HANDOVER.md D65 as of commit f7bb51c.
