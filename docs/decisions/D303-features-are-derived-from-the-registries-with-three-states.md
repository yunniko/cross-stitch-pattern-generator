# D303 · The feature list is derived from the registries, and a feature has three states
Date: 2026-10-06 · Goal: G-102 M1 · Status: active (superseded by: —)
Context: features are switched per site, person and tier (G-102); a new one must appear in the list unasked.
Decision: `app/features/registry.ts` derives the list from the tools, the commands, the export kinds, the generation settings, the dither patterns, the textures and the thread brands. A thing says what feature it is under by a `feature` declaration: left out, its own; `null`, core and never switched; a string, another's. A feature is `on`, `locked` (shown greyed with a note, refused) or `hidden` (absent, refused); unset means on.
Force: requirement — Owner, 2026-10-06: the grouped list, the three states, new features appearing by themselves.
Rejected: a hand-kept list (ruled out by the Owner); on/off alone (tiers need a visible locked state).
Consequence: a new registry entry is a feature unless it says `feature: null`; the interface reads `useFeature` or `useGatedOptions` where it reads a registry; a stored setting naming an unusable feature is read as its default (`lib/features/in-force.ts`). The server's check is M2's.
Evidence: tests/unit/features.spec.ts; the proof in GOALS.md (G-102, M1 entry)
