# D004 · Chart canvas size is clamped by shrinking the cell size
Date: 2026-09-09 · Goal: G-001 · Status: partly superseded (superseded by: D026 for whole-chart budgets)
Context: A 1000-stitch chart at a fixed 24 px per cell would be 24,000 px wide, which exceeds real browser canvas limits.
Decision: The cell size shrinks so the canvas's longer side never exceeds MAX_CANVAS_DIMENSION (12,000 px).
Rejected: a fixed cell size (large custom sizes would fail or crash silently).
Consequence: Every renderer computes its cell size through the shared clamp rather than a constant.
Evidence: lib/export/render.ts; HANDOVER.md D4 as of commit f7bb51c.
