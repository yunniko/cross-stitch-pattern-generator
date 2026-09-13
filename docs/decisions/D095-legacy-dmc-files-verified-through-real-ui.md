# D095 · Pre-brand pattern files open as DMC patterns, checked through the real file-open path
Date: 2026-09-12 · Goal: G-029 M4 · Status: active (superseded by: —)
Context: Earlier compatibility tests called the deserializer directly, which doesn't prove the app's own open path handles an old file.
Decision: Feed a literal old-format file (dmcMode true, no threadBrand) through the running app's file input and confirm it opens with the DMC-only add picker. Then deploy G-029.
Rejected: relying on unit-level deserializer tests alone.
Consequence: Legacy dmcMode stays readable for as long as old files may exist. Deployed 2026-09-12 with Full range, DMC, Cosmo and Anchor live.
Evidence: tests/unit/pattern-serialize.spec.ts; lib/editor/pattern-serialize.ts; HANDOVER.md D95 as of commit f7bb51c.
