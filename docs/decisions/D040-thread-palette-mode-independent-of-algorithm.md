# D040 · Palette mode is independent of the clustering algorithm
Date: 2026-09-11 · Goal: G-021 · Status: partly superseded (superseded by: D092 for multiple brands)
Context: The Owner asked for DMC to be a palette mode, so both Latest and Original can produce full-range or DMC palettes.
Decision: Worker options carry a GenerationMode (latest or original) and a separate PaletteMode. The brand snap runs when the palette mode asks for it, whichever algorithm ran. The UI shows two independent toggles.
Rejected: keeping DMC as a third algorithm (it always implied Latest's clustering).
Consequence: Brand-aware UI reads the pattern's stored brand, never the algorithm. For small toggles, verify selection through DOM state, since screenshots misread them. D092 extended the palette mode to Cosmo and Anchor.
Evidence: lib/pipeline/pattern.worker.ts; app/components/processing-params.tsx; tests/e2e/palette-modes.spec.ts; HANDOVER.md D40 as of commit f7bb51c.
