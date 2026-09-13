# D046 · Crisp edges mode is planned from the external design report, queued behind open work
Date: 2026-09-11 · Goal: G-024 planning · Status: active (superseded by: —)
Context: A design report for an optional Crisp edges mode appeared in the tree. Averaging in downsampling manufactures an intermediate stitch color at hard boundaries that no later stage can recover.
Decision: Verify the report's reproduction and code references, then plan G-024 as a draft following the report's six-step sequence, queued behind G-022 M5 and G-020 M5.
Rejected: bundling it into in-flight boundary work (the report says coordinate, not merge); copying its technical tables into GOALS.md (the report stays the authoritative reference).
Consequence: The report is the source of truth for Crisp's data structures, unary cost and acceptance matrix.
Evidence: docs/reviews/2026-09-11-crisp-edges-implementation-recommendations.md; HANDOVER.md D46 as of commit f7bb51c.
