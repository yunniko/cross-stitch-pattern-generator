# D099 · The pattern deserializer validates every field, not just grid geometry
Date: 2026-09-13 · Goal: G-031 M1 · Status: active (superseded by: —)
Context: `deserializePattern` checked cell indices against `palette.length` but never `palette.length <= MAX_COLORS` (a 300-entry palette was accepted and `Uint8Array.from` silently turned index 260 into 4 and 255 into `EMPTY_CELL`), and never type-checked `rgb`/`symbol`/`name` (review B2/B3).
Decision: reject any file whose dimensions aren't positive integers within `MAX_STITCHES`, whose palette is empty, longer than `MAX_COLORS`, has a non-3-byte `rgb`, an empty/non-string `symbol`, a non-string `name`, or duplicate symbols, or whose cell indices aren't integers in range; the parsed-object half is exposed as `deserializePatternData` for the IndexedDB store.
Rejected: lenient repair (drop bad entries, dedupe symbols) — silently changes a file the user believes is theirs; truncating to `MAX_COLORS` — same problem.
Consequence: every accepted pattern is renderable by construction; a seeded fuzz proves the accept-or-throw contract, so new fields must be validated here too, not downstream.
Evidence: tests/unit/pattern-serialize.spec.ts; tests/unit/pattern-serialize-fuzz.spec.ts (200 seeded mutations; 14 tests fail on the pre-fix code, verified 2026-09-13).
