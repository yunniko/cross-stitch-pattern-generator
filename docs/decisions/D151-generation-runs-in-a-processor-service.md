# D151 · Generation runs in a processor service that only the app can reach
Date: 2026-09-17 · Goal: G-034 M2 · Status: active (superseded by: —)
Context: moving generation off the browser needs a place to run it, a way to refuse overload, and a result format that cannot differ from what the editor already loads.
Decision: a second container, `processor/server.ts`, holds the decoded photos and a bounded worker pool; it publishes no port, so the app's Route Handlers under `app/api/` are its only caller and carry the Origin check and per-address rate limit. Results are returned in the project's own editable-JSON save format, and `NEXT_PUBLIC_PROCESSING` selects the browser or server path at build time.
Rejected: generating inside the Next server (one runaway job would take the pages down with it); a second binary result encoding (a `Uint8Array` of cells does not survive `JSON.stringify`, and the save format already solves that); a runtime flag (Next inlines `NEXT_PUBLIC_*` at build).
Consequence: the pipeline modules must stay free of browser APIs, and any change to the save format changes the wire format too.
Evidence: tests/unit/processor-pool-parity.spec.ts; tests/unit/processor-pool-limits.spec.ts; tests/unit/request-guard.spec.ts
