# D078 · One export dropdown, an "Export all" .cspzip bundle, and import that detects ZIPs by content
Date: 2026-09-12 · Goal: G-027 · Status: active (superseded by: —)
Context: The Owner asked for one single-file export dropdown, an Export all ZIP with every format, ZIP-aware import, overlap moved to Options, and a custom extension.
Decision: One ExportKind dropdown with shared busy and error state. Export all writes a .cspzip (a plain ZIP) by calling the existing exporters and unpacking A4 ZIPs into A4_color and A4_bw. Import tries a ZIP parse first and takes the first valid .json entry, or falls back to JSON text. Overlap is a persisted option defaulting to 5.
Rejected: detecting by extension (a renamed file would fail); falling back to JSON text when a ZIP has no valid pattern (confusing error); re-rendering A4 pages for the bundle (duplicates tested code).
Consequence: Export all blocks the tab while building (softened by D079). Every export entry reuses a shipped exporter.
Evidence: lib/export/export-all.ts; lib/editor/pattern-import.ts; tests/unit/pattern-import.spec.ts; tests/e2e/export-all.spec.ts; HANDOVER.md D78 as of commit f7bb51c.
