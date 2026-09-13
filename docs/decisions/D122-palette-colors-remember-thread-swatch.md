# D122 · Palette colours remember their thread swatch by brand and code; a brand lock means every colour is that brand's thread
Date: 2026-09-13 · Goal: G-033 M1 · Status: active (superseded by: —)
Context: The colour editor needs each colour's thread identity. Names can be renamed and Anchor colours carry DMC RGB, so neither identifies a thread.
Decision: `PaletteColor.source` is an immutable `{ brand, code }` holding the table's canonical code. Brand generation, thread picks and OXS import set it; a manual RGB edit clears it. `threadBrand` requires every colour to have a source of that brand: custom or cross-brand edits on a locked pattern throw, and a load that can't establish it clears the lock. Files and autosave records carry `formatVersion`: version 7 never infers, older data infers only within its `threadBrand` by exact thread name. A malformed or unknown source is dropped. OXS export takes thread numbers only from `source`.
Rejected: cross-brand inference by name and RGB (renames create false identities); rejecting files with a malformed source (autosave deletes unreadable records); a composite id string (parsing, no benefit).
Consequence: Every palette constructor sets or omits `source` deliberately.
Evidence: tests/unit/pattern-edit.spec.ts; tests/unit/pattern-serialize.spec.ts; GOALS.md G-033 progress log
