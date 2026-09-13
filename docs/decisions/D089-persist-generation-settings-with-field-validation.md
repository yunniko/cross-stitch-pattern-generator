# D089 · Pattern size, color count, algorithm and palette persist, each validated field by field
Date: 2026-09-12 · Goal: Owner request · Status: active (superseded by: —)
Context: The Owner asked for generation settings and pattern size to survive a reload. No saved pattern records them.
Decision: Add sizePreset, customSize, colorCount, generationMode and paletteMode to WorkspaceOptions. Each field has a default and its own bounds, integer or allow-list check on load.
Rejected: whole-object validation (one bad field would discard every preference); storing them on the pattern (they describe the next generation, not the current one).
Consequence: A corrupt or older stored blob degrades per field to defaults. New options follow the same pattern.
Evidence: lib/editor/workspace-storage.ts; tests/unit/workspace-storage.spec.ts; app/hooks/use-workspace-options.ts; HANDOVER.md D89 as of commit f7bb51c.
