# D233 · A backstitch thread is told apart by its dash, and the table is mirrored
Date: 2026-09-25 · Goal: G-073 M5 · Status: active (superseded by: —)
Context: at the A4 cell of 2.75 mm a line is 0.55 mm wide, far too thin for a glyph; five threads still have to be told apart. Settled in `docs/reviews/2026-09-25-backstitch-research.md`.
Decision: five dash patterns, assigned by a thread's **rank among the threads that carry backstitch**, not by its palette index. Beads carry the symbol on lines of five cells or more. Segments are cut in shared code, not asked of the backend.
Force: requirement — the Owner chose dashes then beads (2026-09-25). Rank over index is judgment: modulo five, two threads five apart would share a pattern while three went unused, The cost is that patterns can shift between exports when a lower-numbered thread gains backstitch.
Rejected: a glyph inside the stroke (0.9 pt, under the legibility floor); the canvas's own dash (raster and PDF disagree on phase).
Consequence: `lib/editor/backstitch-style.ts` and `rust/cs-export/src/backstitch.rs` are the same table twice, so `scripts/rust-backstitch-style.ts` compares them through the real binary; a change to one alone fails.
Evidence: tests/unit/backstitch-style.spec.ts; scripts/rust-backstitch-style.ts
