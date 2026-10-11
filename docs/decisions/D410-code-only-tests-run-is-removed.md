# D410 · Code that only tests run is removed, and CI keeps it out
Date: 2026-10-11 · Goal: G-134 M2 · Status: active (superseded by: —)
Context: since D221 every download comes from the Rust exporter, yet the TypeScript export engine, `cs-wasm`, the parity scripts and the TS gamut mapping still sat in the tree, proved by specs that ran no shipped path.
Decision: delete them, port the specs that guarded live behaviour to Rust (header text, gamut, thread split), and fail CI when a module under app/, lib/ or processor/ is run by nothing that ships (`check:reachable`).
Force: requirement — STANDARDS "Verified means the path production runs"; G-134 criterion 3.
Rejected: keeping the TS engine as a fallback (D221 retired it; nothing switches to it); a function-level check (test seams and thin wrappers would need exceptions; the test-only fill functions are G-134 M6).
Consequence: D074, D125, D126, D153, D169, D172, D186 and D219 are superseded, and D396 in part. D264's gutter is 8 mm since commit ff36e18, not 12 mm. The export types live in `lib/export/export-request.ts`; the live chart drawing in `lib/editor/chart-render.ts`.
Evidence: scripts/check-reachable.mjs; tests/unit/rust-color-names-table.spec.ts; rust/cs-core/src/color.rs; docs/reviews/2026-10-10-code-health-review.md
