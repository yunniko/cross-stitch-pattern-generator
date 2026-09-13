# D014 · The realistic preview is a separate renderer drawing one cross per cell
Date: 2026-09-09 · Goal: G-002 · Status: superseded (superseded by: D015)
Context: The Owner wanted a simple stitched-look preview with no symbols, grid, legend or markers.
Decision: A standalone renderStitchPreviewToCanvas draws one round-capped X per cell on a flat fabric color with a white border. After two Owner follow-ups the stroke ratio settled at 0.4 with no inset.
Rejected: a fabric-weave texture (Owner asked for "nothing complex"); a third mode inside the chart renderer (its gutter and legend layout don't apply).
Consequence: The preview shares only the canvas-size clamp and PNG download helpers with the chart renderer.
Evidence: HANDOVER.md D14 as of commit f7bb51c.
