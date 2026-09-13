# D002 · Size presets are 50, 100 and 150 stitches on the longer side
Date: 2026-09-09 · Goal: G-001 · Status: active (superseded by: —)
Context: The Owner's brief left the Small/Medium/Large stitch counts as placeholders, and no industry standard exists.
Decision: Small 50, Medium 100, Large 150 on the image's longer side, with Custom covering 10–1000.
Rejected: copying one generator's width list (tools vary widely, so none is a standard).
Consequence: The presets live in one config object in lib/types.ts. D047 later added XL 200 and XXL 250 there.
Evidence: lib/types.ts; HANDOVER.md D2 as of commit f7bb51c.
