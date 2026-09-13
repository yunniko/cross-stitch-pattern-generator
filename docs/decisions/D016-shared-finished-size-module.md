# D016 · Finished-size conversion lives in one pure module
Date: 2026-09-09 · Goal: G-003 · Status: active (superseded by: —)
Context: The Owner asked for centimeters, and the Aida-count constant was duplicated between the page and the renderer.
Decision: Move the constant, the stitch-to-inch and stitch-to-cm conversions and both format helpers into one shared, unit-tested module.
Rejected: keeping per-call-site copies (they would drift).
Consequence: Every size readout and chart header converts through this module. D019 made the fabric count and unit parameters.
Evidence: lib/export/finished-size.ts; tests/unit/finished-size.spec.ts; HANDOVER.md D16 as of commit f7bb51c.
