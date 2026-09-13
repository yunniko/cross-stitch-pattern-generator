# D019 · Fabric count is selectable from 11/14/16/18 and size shows in one chosen unit
Date: 2026-09-09 · Goal: G-005 · Status: active (superseded by: —)
Context: The Owner asked for an Aida-count menu, based on counts that really exist, and an inch/cm switch.
Decision: STANDARD_AIDA_COUNTS = [11, 14, 16, 18] with 14 as the default. Every size formatter takes aidaCount and a single SizeUnit, and the chart header uses the values active at generation.
Rejected: 28-count evenweave (stitched over two threads, which needs a model this app doesn't have; see docs/domain-reference-fabric-types.md); showing both units at once (the Owner asked for a switch).
Consequence: Adding a count is a one-line change. D033 moved these controls into the persisted Options panel.
Evidence: lib/export/finished-size.ts; tests/unit/finished-size.spec.ts; HANDOVER.md D19 as of commit f7bb51c.
