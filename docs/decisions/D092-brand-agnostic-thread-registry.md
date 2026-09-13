# D092 · Thread brands live in one registry with a matching strategy; patterns store threadBrand
Date: 2026-09-12 · Goal: G-029 M1 · Status: active (superseded by: —)
Context: Adding Cosmo and Anchor needed the DMC-only plumbing generalized. A Codex critique found Anchor has no measured RGB data, plus call sites that would silently break with a second brand.
Decision: THREAD_BRANDS entries carry matching "direct" or "dmc-equivalence". StitchPattern.threadBrand replaces dmcMode, which is read only from legacy files (format version 5). Brand code checks paletteMode !== "full", and stored preferences validate against the registry.
Rejected: a flat color list per brand (wrong for Anchor); permanent compatibility wrappers for renamed internal functions; tolerance-band tests alone (D018: they can pass a real behavior change).
Consequence: A golden hash baseline recorded before the refactor proves DMC output unchanged. addColor can still add an arbitrary hex color to a brand pattern, a pre-existing gap left open.
Evidence: lib/threads/thread-brands.ts; lib/threads/brand-match.ts; tests/unit/dmc-generalization-baseline.spec.ts; HANDOVER.md D92 as of commit f7bb51c.
