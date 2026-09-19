# D171 · The server writes its own PNGs and releases each canvas once encoded
Date: 2026-09-19 · Goal: G-047 M1 · Status: active (superseded by: —)
Context: the canvas library's PNG encoder was 86 % of every A4 page (351 of 406 ms), and finished export canvases held native memory V8 cannot see until some later collection.
Decision: `processor/png-encode.ts` streams `getImageData` strips through the Up filter and zlib level 6, RGB unless a pixel is translucent; A4 pages are drawn while the previous one compresses; every export encodes through `canvasToPngBlobAndRelease`, which then shrinks the canvas to one pixel.
Force: judgment — measured: the A4 export 2.5× faster with smaller files and the same decoded pixels.
Rejected: zlib level 3 (3.6× faster, but every file 40 % larger than before); one page canvas reused across A4 pages (peak RSS 274 → 757 MB).
Consequence: an export canvas must not be used after it is encoded. The browser path keeps its own encoders.
Evidence: tests/unit/png-encode.spec.ts; docs/reviews/2026-09-19-algorithm-review.md; GOALS.md, G-047 progress log, 2026-09-19
