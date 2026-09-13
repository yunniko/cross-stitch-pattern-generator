# D079 · Heavy exports yield to the main thread between steps instead of moving to a worker
Date: 2026-09-12 · Goal: G-027 follow-up · Status: active (superseded by: —)
Context: The Owner asked for asynchronous export. Rendering and zipping are CPU-bound work on the main thread.
Decision: A yieldToMain helper (setTimeout 0) runs between each Export all step and after each A4 grid page.
Rejected: porting rendering to a Web Worker with OffscreenCanvas (large, risky change for the request).
Consequence: The tab repaints between chunks but still stalls during each individual render or encode. True background export would need the worker port.
Evidence: lib/export/yield.ts; lib/export/export-all.ts; lib/export/a4-export.ts; HANDOVER.md D79 as of commit f7bb51c.
