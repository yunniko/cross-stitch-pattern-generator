# D191 · The editable save stays TypeScript, in the browser
Date: 2026-09-20 · Goal: G-048 M5 · Status: active (superseded by: —)
Context: D190 moves the server-side work to Rust. The editable JSON is the one export written in the page, not on the processor (D149).
Decision: the editable save keeps its TypeScript writer and stays in the browser; Rust's byte-identical writer is kept for the parity harness only.
Force: requirement — a save has to work when the processor is unreachable, which is why it was left in the page in the first place.
Rejected: moving it to the processor for consistency (it would make saving depend on the server); dropping the Rust writer (it is what proves the serializer agrees, and Export all embeds it).
Consequence: one export is written by two implementations that must stay byte-identical; `npm run compare:rust-exports` covers it.
Evidence: docs/reviews/2026-09-20-rust-comparison-report.md; scripts/rust-export-parity.ts
