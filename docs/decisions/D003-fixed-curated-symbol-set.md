# D003 · Chart symbols come from a fixed, hand-curated list
Date: 2026-09-09 · Goal: G-001 · Status: active (superseded by: —)
Context: Every color needs its own symbol, legible at small cell sizes on screen and in print, following the one-symbol-per-color chart convention.
Decision: Use a fixed curated symbol list ordered in code, not a font's full glyph range.
Rejected: arbitrary font glyphs (confusable shapes and emoji-fallback risk).
Consequence: D007 removed confusable pairs and ordered the list by visual weight. D032 grew it from 64 to 100 symbols.
Evidence: lib/color/symbols.ts; tests/unit/symbols.spec.ts; HANDOVER.md D3 as of commit f7bb51c.
