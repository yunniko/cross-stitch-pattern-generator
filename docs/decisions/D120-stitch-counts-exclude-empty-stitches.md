# D120 · Stitch counts count only filled stitches; sizes stay the canvas grid
Date: 2026-09-13 · Goal: Owner request (no goal) · Status: active (superseded by: —)
Context: Displays called the whole canvas "stitches": the A4 and PDF info page showed width × height as the total, so empty stitches (D028, D109) inflated every count the Owner saw.
Decision: Wherever a stitch count is shown (the Image window header, the chart PNG header, the A4 and PDF info page), it is `filledStitchCount`, which counts cells that aren't empty. The canvas size (width × height) and the finished size derived from it are unchanged.
Rejected: summing palette counts (they can go stale between edits; the cells are authoritative); trimming the canvas to the stitched area (the Owner asked for the canvas size to stay).
Consequence: New stitch-count displays use `filledStitchCount`, never width × height. Per-colour counts and floss estimates already counted only filled stitches.
Evidence: tests/unit/a4-render.spec.ts; tests/unit/render.spec.ts; tests/e2e/generate-pattern.spec.ts
