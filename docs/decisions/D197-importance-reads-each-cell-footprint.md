# D197 · Cell importance reads each cell's own footprint
Date: 2026-09-21 · Goal: G-051 · Status: active (superseded by: —)
Context: importance assigned each source pixel to a cell by truncation, so on a chart finer than the photo whole cells received no pixel and stayed at importance 0 — 36–89 % of them — even along a strong edge (2026-09-20 audit).
Decision: each cell reads the pixels of `[ceil(c·src/grid), ceil((c+1)·src/grid))`, and a cell whose footprint holds none reads the pixel its centre falls in.
Force: requirement — measured: that span is the exact inverse of the old assignment for every downscale and 1:1 size pair, so nothing pinned moves, while the old mapping demonstrably left holes above 1:1.
Rejected: area-weighted sampling like `downsampleToGrid` (more principled, but it changes every photo's importance and would move the 18 golden hashes for no measured gain); leaving it, since the effect is mild.
Consequence: importance now follows the photo at any chart size. Per-cell sums keep source order, which is what makes the downscale case bit-identical; a future change to that order would move the hashes.
Evidence: tests/unit/edge-map.spec.ts; scripts/rust-parity.ts (the `upscale/` cases); rust/cs-core/src/edge_map.rs
