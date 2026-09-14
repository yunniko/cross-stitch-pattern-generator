# D126 · The PDF adapter omits opacity for opaque colors and caches parsed styles
Date: 2026-09-14 · Goal: G-035 M2 · Status: active (superseded by: —)
Context: pdf-lib registers a new graphics-state resource for every draw call that passes an opacity, so each grid page's resource dictionary grew with every cell and was searched on every call.
Decision: PdfCanvasAdapter passes an opacity only when alpha is below 1, and caches parsed CSS colors, font strings and glyph widths.
Rejected: keeping opacity 1 on every call (measured 1.8× slower drawing and twice the file size); writing raw content-stream operators (a larger change, kept for later if the M2 targets are missed).
Consequence: PDF bytes change while what they show does not, so the Owner re-confirms a real Pattern Keeper import (D097). Callers must keep passing plain CSS color strings.
Evidence: tests/unit/pdf-canvas-adapter-resources.spec.ts; docs/reviews/2026-09-14-performance-investigation.md.
