# D057 · Crisp mode starts from locked reproduction fixtures and a per-module build-on/leave-alone inventory
Date: 2026-09-11 · Goal: G-024 M1 · Status: active (superseded by: —)
Context: Before any Crisp production code, the report's reproduction had to be locked in and existing modules checked against the current tree.
Decision: Lock the 64×64 black/white split (112 black, 16 manufactured gray, 128 white) and a genuine-gray control that yields two unrelated grays. Keep Standard downsampling, importance and pairwise energy unchanged. Crisp adds new evidence and a weighted-quantizer interface, plus a unary, admissible-label cost shared by every consumer, and extends the brand reoptimize path.
Rejected: modifying downsampleToGrid (it stays the Standard sampler); gating hard boundaries on luminance importance (blind to hue edges); running the palette recompute unchanged on Crisp cells (re-blends chosen colors); coordinating with contour refinement (orthogonal, and not adopted).
Consequence: Crisp must reproduce Standard output exactly when disabled.
Evidence: tests/unit/crisp-edges-fixtures.ts; tests/unit/crisp-edges-regression.spec.ts; HANDOVER.md D57 as of commit f7bb51c.
