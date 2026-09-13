# D024 · A4 export splits pure page layout from rendering and ZIP bundling
Date: 2026-09-10 · Goal: G-009 · Status: active (superseded by: —)
Context: Large charts don't fit one printed page. The Owner's spec required splitting logic isolated from rendering and UI.
Decision: A pure calculateA4Layout reserves caption and number gutters and exports grid origins. The page renderer reuses drawChart per region with a print-scaled legend. The export renders pages one at a time into a jszip archive. Color and B&W only, with one legend page and a pre-download layout preview.
Rejected: the optional per-page mini-map (would share header space with coordinate numbers and risk verified rendering); paginating the realistic preview (no grid or symbols).
Consequence: Renderers never recompute layout offsets; they read them from the layout. The dpi option must reach page pixel sizes.
Evidence: lib/export/a4-layout.ts; lib/export/a4-render.ts; tests/unit/a4-layout.spec.ts; tests/e2e/a4-export.spec.ts; HANDOVER.md D24 as of commit f7bb51c.
