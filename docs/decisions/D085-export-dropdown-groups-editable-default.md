# D085 · The export dropdown defaults to editable JSON and groups formats under Color and Black & white
Date: 2026-09-12 · Goal: Owner request · Status: active (superseded by: —)
Context: The Owner specified the order: editable JSON first and default, realistic preview, then Color and Black & white groups each with full chart, A4 pages and PDF.
Decision: Two ungrouped options followed by two optgroups with shortened labels. Tests select options by their unique value, not label.
Rejected: literal dividers between ungrouped options (HTML select has none); repeating the color qualifier in each label (the Owner's design put it in the group header).
Consequence: Labels repeat across groups, so selecting by label would pick the first match.
Evidence: app/hooks/use-exports.ts; tests/e2e/a4-export.spec.ts; tests/e2e/pattern-keeper-pdf-export.spec.ts; HANDOVER.md D85 as of commit f7bb51c.
