# D082 · Tools are hand-drawn SVG icons in three groups, keeping their names as aria-labels
Date: 2026-09-12 · Goal: Owner request · Status: active (superseded by: —)
Context: The Owner asked for icons instead of tool names, grouped brush and fill, select and move, then pan, zoom and highlight.
Decision: Draw each icon from basic SVG strokes, separate the groups with dividers, and keep the old text as aria-label and title. D083 and D084 later redrew the fill and brush icons.
Rejected: an icon library dependency (no portfolio project uses one); dropping accessible names.
Consequence: E2E tests and screen readers still find tools by name.
Evidence: app/components/tools-dock.tsx; tests/e2e/move-highlight.spec.ts; HANDOVER.md D82 as of commit f7bb51c.
