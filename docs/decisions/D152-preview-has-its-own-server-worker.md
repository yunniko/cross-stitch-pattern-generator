# D152 · The enhancement preview gets its own worker on the server
Date: 2026-09-17 · Goal: G-034 M3 · Status: active (superseded by: —)
Context: a preview must appear within about two seconds, but a generation holds a pool worker for twelve or more, so sharing the pool would put previews behind them.
Decision: the processor runs previews on a dedicated worker (`processor/preview-runner.ts`, `processor/preview-worker.ts`) with its own short queue and deadline, and caches the encoded result per photo and mode (`processor/preview-cache.ts`). This mirrors D116, which gave the browser preview its own worker for the same reason.
Rejected: a preview job type in the generation pool (a preview would wait behind three long generations); computing on the request thread (one preview would stall every other request); returning raw pixels (several megabytes per preview against tens of kilobytes as WebP).
Consequence: the container runs four workers on three CPUs, which is deliberate — a preview is short and infrequent next to a generation. Preview responses are bytes, not pixels, so the client shows them with an object URL rather than building a data URL.
Evidence: tests/unit/preview-runner.spec.ts; docs/decisions/D149-server-processing-caps-and-pool.md
