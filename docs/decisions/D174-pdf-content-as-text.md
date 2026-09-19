# D174 · The PDF adapter writes its direct operators as text
Date: 2026-09-19 · Goal: G-047 M3 · Status: active (superseded by: —)
Context: the Pattern Keeper PDF spent its time in pdf-lib's bookkeeping, not drawing: an operator object and a formatted number object per operand (about eleven operators a stitch), and a MediaBox walk for the page height on every call.
Decision: `PdfCanvasAdapter` formats each direct fill, text run and line exactly as pdf-lib would, collects a page's lines, and hands them over as one operator whose name is the whole batch, before any pdf-lib drawing call and when the page is finished (`finish()`); the page height is read once.
Force: judgment — the file is byte-identical and the PDF 3.5× faster.
Rejected: merging same-colour fill runs (changes the file, and Pattern Keeper's reading of it is unverified here); Node's zlib for the stream (changes the compressed bytes).
Consequence: whoever draws through the adapter must call `finish()` before the page is flushed or saved, or that page loses its content. Rotated text still goes through pdf-lib.
Evidence: tests/unit/pdf-text-content.spec.ts; tests/unit/pdf-canvas-adapter.spec.ts; GOALS.md, G-047 progress log, 2026-09-19
