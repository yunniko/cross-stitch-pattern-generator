# D006 · The pipeline optimizes a stitchable pattern: OKLab clustering plus an energy optimizer in a worker
Date: 2026-09-09 · Goal: G-001 M5 · Status: active (superseded by: —)
Context: The Owner's spec asked for coherent regions, little confetti, preserved edges and a rationalized palette, accepting a small per-cell color-accuracy loss.
Decision: Replace plain k-means plus nearest-color with OKLab k-means followed by energy-based local optimization, contour cleanup and palette merging. Freeze the external buildPattern contract, run the work in a Web Worker, and use typed-array cell buffers.
Rejected: CIELAB with CIEDE2000 (Euclidean OKLab is nearly as perceptual and far simpler); Floyd–Steinberg dithering (recreates confetti); a plugin registry around energy terms (plain pure modules suffice); exact-pixel golden images (break on every tuning, so tolerance bands are used).
Consequence: Energy terms are normalized before weighting so a single speck isn't double-penalized. Stages stay pure and unit-testable in Node.
Evidence: lib/pipeline/pattern.ts; lib/pipeline/pattern.worker.ts; tests/unit/regression.spec.ts; HANDOVER.md D6 as of commit f7bb51c.
