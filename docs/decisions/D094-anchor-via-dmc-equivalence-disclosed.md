# D094 · Anchor matches the nearest real DMC thread, relabels it, and discloses the derivation
Date: 2026-09-12 · Goal: G-029 M3 · Status: active (superseded by: —)
Context: No measured Anchor color data exists. The only DMC-to-Anchor table found has no license, so the choice went to the Owner.
Decision: Use the table's code pairs only, as factual data (Owner's documented judgment call). Match the nearest DMC thread with its real RGB, then relabel via the equivalence. The picker list keeps one entry per Anchor code, using the first DMC code's RGB. A derivationNote is shown wherever Anchor is offered.
Rejected: nearest match against the deduplicated Anchor list (fewer, collapsed candidates give worse matches); the source's description column as names (those are DMC names, ambiguous for 99 collisions); dropping Anchor or searching longer (Owner's choice).
Consequence: 99 of 454 DMC codes share an Anchor code, so distinct colors can merge. Read the provenance doc before touching this data.
Evidence: docs/anchor-colors-provenance.md; lib/threads/anchor-colors.ts; tests/unit/anchor-colors.spec.ts; HANDOVER.md D94 as of commit f7bb51c.
