# D008 · Edge importance weights the optimizer as a strict generalization of the plain Potts penalty
Date: 2026-09-09 · Goal: G-001 M6 · Status: partly superseded (superseded by: D044 for pair edge evidence)
Context: No segmentation model is available, but the optimizer should protect real edges and small important details.
Decision: A Sobel-plus-local-contrast importance map (0–1 per cell) discounts smoothness across real edges and charges an edgeLoss term for erasing them. A coarse pass then a fine pass run as weight annealing, not a spatial pyramid.
Rejected: a resolution pyramid (the stitch grid has no coarser natural level); a separate code path for edge-aware mode (a zero importance map must reproduce the plain penalty exactly).
Consequence: A cell mapped to one source pixel gets zero importance for an isolated dot, because Sobel reads neighbors. Tests use realistic downsampling ratios.
Evidence: lib/pipeline/edge-map.ts; lib/pipeline/local-optimizer.ts; tests/unit/local-optimizer.spec.ts; HANDOVER.md D8 as of commit f7bb51c.
