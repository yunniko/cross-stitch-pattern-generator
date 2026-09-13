# D074 · The PDF exporter reuses the A4 page-drawing code through a bounded canvas adapter
Date: 2026-09-12 · Goal: G-026 M2 · Status: active (superseded by: —)
Context: A PDF export could duplicate the shipped A4 drawing code or reuse it; a Codex critique agreed on reuse and found three problems in the plan.
Decision: A4 drawing functions take a ChartDrawingContext whose members use the exact native canvas types. PdfCanvasAdapter implements it for a PDF page, throwing on anything outside the reused calls. A4Layout carries dpi, and baselines use fontkit ascent and descent.
Rejected: a parallel PDF drawing implementation (D011-style drift); narrowing fillStyle to string (a real canvas context would no longer satisfy the interface); pdf-lib's heightAtSize without descender (returns 8.17 instead of 11.14 at 12 pt).
Consequence: The PDF has no bold face, and a few pixel-calibrated constants weren't rescaled for 72 DPI (cosmetic). Unit tests allow 15 s for pdfjs-dist workers.
Evidence: lib/export/pdf-canvas-adapter.ts; lib/export/chart-drawing-context.ts; tests/unit/pdf-canvas-adapter.spec.ts; HANDOVER.md D74 as of commit f7bb51c.
