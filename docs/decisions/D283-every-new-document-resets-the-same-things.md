# D283 · Every new document resets the same things
Date: 2026-10-04 · Goal: G-091 · Status: active (superseded by: —)
Context: the replace table (D282) showed four differences between the ways a chart arrives.
Decision: every new document, however it arrives, resets the view in full (piece in hand, crop frame, zoom, colour in hand, lit threads of both sections with Isolate, the Text tab's thread), clears the last one's messages, and a chart with no photo starts with neutral sliders; the first Generate is a new document like the rest.
Force: requirement — Owner, 2026-10-04: "and fix differences".
Rejected: leaving them (lit backstitch and the Text thread are indexes into a palette that is gone, the kind of leftover D217 came from).
Consequence: the unit tests assert the rule over every row, so a new way in cannot skip it. The Crop tool stays in hand across documents with a fresh frame. The view chosen (for example Stitched) is not reset.
Evidence: tests/unit/document-replace.spec.ts; tests/e2e/new-document-resets.spec.ts
