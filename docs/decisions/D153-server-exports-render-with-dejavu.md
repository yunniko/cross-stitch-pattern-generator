# D153 · Server exports draw their text with DejaVu Sans
Date: 2026-09-17 · Goal: G-034 M4 · Status: active (superseded by: —)
Context: the image has no fonts, so `measureText` returned 0 and server exports would have been structurally wrong, not merely different. The browser resolves `FONT_STACK` to Arial, which cannot be shipped.
Decision: register the DejaVu Sans already shipped for the PDF (D073) through `GlobalFonts`. A registered font satisfies the existing `FONT_STACK`, so no drawing code changes.
Rejected: Liberation Sans, closer to Arial but a new asset and licence; one font on both sides, which would change the exports users get today.
Consequence: server text is ~12 % wider, so PNG dimensions differ only where the header binds, below roughly 226 px of chart width; wider charts differ in glyph placement. A second cause this decision does not cover — texture resampling — also differs, so parity bounds the measured difference instead of asserting identical bytes.
Evidence: docs/reviews/2026-09-17-export-parity.md; docs/dejavu-font-provenance.md; tests/unit/export-backend.spec.ts
