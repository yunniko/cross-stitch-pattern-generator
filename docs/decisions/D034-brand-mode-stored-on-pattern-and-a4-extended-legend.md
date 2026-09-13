# D034 · Thread mode is stored on the pattern; A4 export adds a paginated extended legend
Date: 2026-09-10 · Goal: G-016 · Status: partly superseded (superseded by: D092 for the brand field)
Context: The Owner clarified that a DMC pattern's mode belongs in the saved file, and asked for a detailed legend in A4 exports.
Decision: The pattern stores its mode (dmcMode, format version 3), set at generation. In that mode "+ Add" offers only real DMC swatches. A4 export adds title, details and color-key pages, paginated, alongside the unchanged compact legend.
Rejected: inferring DMC mode from color names (breaks on rename and on restore); replacing the simple legend (Owner asked to keep it); a single fixed info page (overflows at about 26 colors).
Consequence: Detection always reads the stored flag; splitting "CODE - Name" is cosmetic. D092 replaced dmcMode with a thread-brand field.
Evidence: lib/export/a4-render.ts; lib/editor/pattern-serialize.ts; tests/unit/a4-render.spec.ts; HANDOVER.md D34 as of commit f7bb51c.
