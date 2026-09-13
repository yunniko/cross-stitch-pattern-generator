# D077 · Edge mode is a toggle saved both on the pattern and as a workspace preference
Date: 2026-09-12 · Goal: G-024 M5 · Status: active (superseded by: —)
Context: Crisp mode needed a UI control and persistence.
Decision: An Edges Standard/Crisp toggle feeds the worker the same way as algorithm and palette. A Crisp result carries edgeMode "crisp" in the saved file (format version 4), and the last toggle choice persists in workspace options.
Rejected: storing "standard" explicitly (absence means Standard, like the brand flag); changing the current pattern when toggled (settings apply only to the next Generate).
Consequence: Legacy files load as Standard. D089 later persisted algorithm and palette too.
Evidence: lib/editor/pattern-serialize.ts; lib/editor/workspace-storage.ts; tests/unit/workspace-storage.spec.ts; tests/unit/pattern-serialize.spec.ts; HANDOVER.md D77 as of commit f7bb51c.
