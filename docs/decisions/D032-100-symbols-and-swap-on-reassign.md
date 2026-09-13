# D032 · Up to 100 colors with single-glyph symbols; reassigning a used symbol swaps it
Date: 2026-09-10 · Goal: G-014 · Status: active (superseded by: —)
Context: The Owner needed more symbols and wanted to edit which symbol each color uses.
Decision: Raise MAX_COLORS to 100 by appending 36 vetted glyphs from the same Unicode blocks as the base 64. Picking a symbol another color already uses swaps the two.
Rejected: two-character codes (Owner chose single glyphs); blocking a duplicate pick (other edits always succeed); a full domain review of the new glyphs (manual reassignment is the compensating control); ¢, †, ‡ and ¬ (read as letters or blur at small sizes).
Consequence: The symbol list length must equal MAX_COLORS, and symbols stay unique within a pattern.
Evidence: lib/color/symbols.ts; lib/editor/pattern-edit.ts; tests/unit/symbols.spec.ts; HANDOVER.md D32 as of commit f7bb51c.
