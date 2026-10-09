# D393 · Counts and exports draw the visible layers' top stitches; Export all's editable entry is replaced in the page
Date: 2026-10-09 · Goal: G-130 M4 · Status: active (superseded by: —)
Context: the Owner asked that exports count only the top stitches of visible layers, while the editable save keeps every layer; Export all is built on the server, which knows nothing of layers.
Decision: the thread list and every export read the composite (`flatten`); for a chart of more than one layer the page replaces the bundle's editable entry with `serializeChart` output (`lib/export/bundle-editable.ts`), keeping the palette as edited, as the standalone editable file does.
Force: requirement — the Owner's request and acceptance criterion 5.
Rejected: teaching the Rust exporter the v8 format (a second parser to keep identical for one entry); passing the editable text to the job on its command line (size limits).
Consequence: a one-layer chart's bundle is the server's bytes unchanged; a new bundle entry that must keep layers is made in the page the same way.
Evidence: tests/unit/bundle-editable.spec.ts; tests/e2e/layers-exports.spec.ts