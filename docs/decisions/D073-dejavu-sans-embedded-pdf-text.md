# D073 · PDF charts embed DejaVu Sans with pdf-lib so every symbol is real extractable text
Date: 2026-09-12 · Goal: G-026 M1 · Status: active (superseded by: —)
Context: Pattern Keeper needs vector grids and chart symbols selectable as text, and the 100 symbols span eight Unicode blocks.
Decision: Embed DejaVu Sans 2.37 from its official release, after checking all 100 codepoints against its cmap. Draw with pdf-lib and @pdf-lib/fontkit. Verify text extraction in tests with pdfjs-dist.
Rejected: choosing a font by coverage reputation (checked programmatically instead); trusting that embedding produces selectable text without extracting it.
Consequence: The Bitstream Vera license notice must ship next to the font. µ extracts as μ in pdfjs-dist, a visually identical compatibility pair; D097's real import didn't check that symbol separately.
Evidence: docs/dejavu-font-provenance.md; public/fonts/DejaVuSans.ttf; lib/export/pattern-keeper-pdf.ts; tests/unit/pattern-keeper-pdf.spec.ts; HANDOVER.md D73 as of commit f7bb51c.
