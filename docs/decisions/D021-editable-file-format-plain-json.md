# D021 · The editable pattern file is plain JSON, not a PNG with embedded data
Date: 2026-09-09 · Goal: G-007 planning · Status: active (superseded by: —)
Context: The planned editor needed a save-and-reopen format. The choice changed engineering scope, so it was put to the Owner.
Decision: Save the full pattern state (size, per-stitch palette indices, palette) as a plain JSON file.
Rejected: a PNG with the data in a custom chunk (one previewable file, but browsers can't write custom PNG chunks, so it needs a hand-built chunk writer and parser; Owner chose JSON).
Consequence: The serializer owns format versioning. D028 added the source photo, and D078 wrapped exports in a .cspzip bundle.
Evidence: lib/editor/pattern-serialize.ts; tests/unit/pattern-serialize.spec.ts; HANDOVER.md D21 as of commit f7bb51c.
