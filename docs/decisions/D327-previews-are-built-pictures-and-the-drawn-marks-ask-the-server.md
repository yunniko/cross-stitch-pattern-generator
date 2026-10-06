# D327 · Previews are built pictures, and the drawn marks ask the server
Date: 2026-10-07 · Goal: G-100 M3 · Status: active (superseded by: —)
Context: the previews were drawn in the browser by a TypeScript copy of every pattern, a second implementation that had to agree with Rust's.
Decision: `cs-bench dither-previews` draws each settings-free pattern's tile and preview into `public/dither-previews/`, committed; the drawn marks' preview is `cs-job dither-preview` behind `/api/dither-previews`, asked for 120 ms after the settings rest. The TypeScript patterns are deleted.
Force: requirement — Owner, 2026-10-05/06 (G-100): pregenerated pictures for patterns without settings, the server for a parametric one.
Rejected: building the pictures during `next build` (the web build would need the Rust toolchain); drawing them in the browser from `cs-wasm` (not chosen by the Owner).
Consequence: CI rebuilds the pictures and fails if they differ from those committed (`npm run dither-previews` updates them). A built preview is a 56 × 56 chart's corner, a tie-break: a kernel's corner shifts slightly with chart width. Supersedes D208's per-family cost for settings-free patterns.
Evidence: tests/unit/dither-preview-reference.spec.ts; tests/unit/processor-dither-preview.spec.ts; docs/reviews/2026-10-07-dither-preview-server.md
