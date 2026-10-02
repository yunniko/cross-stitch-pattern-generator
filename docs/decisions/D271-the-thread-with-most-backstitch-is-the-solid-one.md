# D271 · The backstitch thread with the most line is the solid one
Date: 2026-10-02 · Goal: G-084 · Status: active (superseded by: —)
Context: D233 gave the dashes by rank in palette-index order. Recolouring one traced line to a lower-numbered thread put that thread first, so every other line, whose thread now ranked second, turned dashed (Owner, 2026-10-02).
Decision: backstitch threads rank by the length of line each carries, longest first, ties by palette index; the first is solid.
Force: requirement — the Owner reported the other lines turning dashed; the rule itself is judgment.
Rejected: ranking by palette index with the traced thread forced first (a special case); no dash for the first thread added (the same rank problem).
Consequence: a thread gaining or losing line can still move the others' patterns when the order of lengths changes, but one stray line never does. TypeScript and Rust rank the same way; `scripts/rust-backstitch-style.ts` compares them.
Evidence: tests/unit/backstitch-style.spec.ts; scripts/rust-backstitch-style.ts
