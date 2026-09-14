# D125 · Exports run in a worker with OffscreenCanvas, falling back to the main thread
Date: 2026-09-14 · Goal: G-035 M2 · Status: active (superseded by: —)
Context: PNG, A4, PDF and Export all rendered on the main thread; at 1000 stitches the Pattern Keeper PDF froze the page for about 74 s (docs/reviews/2026-09-14-performance-investigation.md).
Decision: One job runner builds every PNG, A4, PDF, OXS and Export all file inside an export worker, drawing into OffscreenCanvas through a shared canvas factory and reporting page progress; only editable JSON runs inline, because OXS blocked the page for 281 ms at 1000 stitches.
Rejected: more main-thread yields (D079; each page's render and encode still blocks); a separate worker-only renderer (two drawing paths would drift, D11).
Consequence: Export drawing code creates canvases only through the canvas factory and never touches document or Image in the worker. Without Worker or OffscreenCanvas 2D, the same job runs on the main thread, yielding between pages.
Evidence: lib/export/export-client.ts; lib/export/canvas-backend.ts; tests/e2e/export-worker.spec.ts; G-035 M2 progress log.
