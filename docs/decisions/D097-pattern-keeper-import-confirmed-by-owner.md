# D097 · Pattern Keeper compatibility rests on the Owner's real import of an exported PDF
Date: 2026-09-12 · Goal: G-026 M4 · Status: active (superseded by: —)
Context: Internal checks proved symbols extract as text, but only the real Pattern Keeper app can confirm grid detection and legend parsing, on the Owner's device.
Decision: Treat the Owner's report "it is working, I checked" as the acceptance result and close G-026 with no code changes.
Rejected: claiming more than was confirmed (whether µ extracting as μ matters in Pattern Keeper was not checked separately).
Consequence: If a pattern using µ looks wrong in Pattern Keeper, check that symbol first.
Evidence: tests/e2e/pattern-keeper-pdf-export.spec.ts; HANDOVER.md D97 as of commit f7bb51c.
