# D075 · The Pattern Keeper PDF export fetches its font on click and is tested against real legend symbols
Date: 2026-09-12 · Goal: G-026 M3 · Status: active (superseded by: —)
Context: The PDF exporter needed a UI entry point without bloating the app bundle with the 700 KB font.
Decision: Export fetches public/fonts/DejaVuSans.ttf when clicked and reuses the A4 overlap, fabric and author options. E2E tests read the symbols the app actually assigned from the DOM legend and check each extracts from the PDF, in Color and B&W.
Rejected: importing the font into the bundle (700 KB on every page load); asserting predicted symbols (might not match the real assignment).
Consequence: A pdf-lib byte array must be copied into a new Uint8Array before building a Blob (TypeScript generic mismatch). Deployed 2026-09-12. D078 moved the button into the export dropdown.
Evidence: tests/e2e/pattern-keeper-pdf-export.spec.ts; app/hooks/use-exports.ts; HANDOVER.md D75 as of commit f7bb51c.
