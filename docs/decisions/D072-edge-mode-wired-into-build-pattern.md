# D072 · buildPattern takes edgeMode, defaulting to Standard and byte-identical when omitted
Date: 2026-09-12 · Goal: G-024 M4.9 · Status: active (superseded by: —)
Context: The standalone Crisp stages (D064–D071) had to be assembled into the real pipeline in the report's stage order.
Decision: With edgeMode "crisp", buildPattern rejects contourRefinement up front and computes pair evidence even without optimization. It then builds the evidence layer, runs weighted quantization, ICM and cleanup with the layer, and repairs after merging. The palette is finalized mode-aware and re-compacted. The brand snap always receives the layer.
Rejected: reading final cells from the pre-finalization index (desyncs the grid from its legend counts after repair); nesting brand repair inside the optimize branch.
Consequence: Standard output stayed byte-identical on the tested fixtures, and every existing pattern test passed unmodified. Deployed 2026-09-12 with no UI control yet.
Evidence: lib/pipeline/pattern.ts; tests/unit/pattern-crisp.spec.ts; tests/unit/pattern.spec.ts; HANDOVER.md D72 as of commit f7bb51c.
