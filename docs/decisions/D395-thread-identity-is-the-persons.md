# D395 · A colour's thread is the person's: any system in any chart, typed numbers kept, a recolour keeps it
Date: 2026-10-10 · Goal: G-131 M1 · Status: active (superseded by: —)
Context: the Owner asked to drop the lock of a chart to one thread system and to let each colour's system and number be edited; D122 locked charts and cleared the thread on a manual recolour.
Decision: `threadBrand` only records the generation system and refuses nothing; `source` may hold a number no catalogue lists (trimmed, at most 20 characters, catalogue numbers stored canonically); a typed number never changes the colour; a manual recolour keeps `source`.
Force: requirement for the unlock and the colour never moving (Owner, 2026-10-10); judgment for keeping the thread on recolour — a shade tweaked to match a skein is still that thread.
Rejected: catalogue-only numbers (people own threads our tables lack); free-text systems (exports and matching need a known system); clearing the thread on recolour (loses typed numbers).
Consequence: exporters print `source` as stored and must not assume it is in a catalogue (G-131 M2); a thread's RGB may differ from its table's.
Evidence: tests/unit/thread-identity.spec.ts; tests/unit/stamp-place.spec.ts; tests/e2e/color-editor.spec.ts