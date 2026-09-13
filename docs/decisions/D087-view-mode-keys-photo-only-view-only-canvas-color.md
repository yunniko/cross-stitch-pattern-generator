# D087 · Keys 1–5 switch views, including an original-photo view; canvas color is view-only
Date: 2026-09-12 · Goal: Owner request · Status: active (superseded by: —)
Context: The Owner asked for number-key view switching, a photo-only view, and a canvas color behind empty stitches and the realistic preview that never affects export.
Decision: Add a photo-only view mode, disabled without a source photo. drawChart takes a trailing emptyCellColor defaulting to white, passed only by the interactive canvas. The realistic preview's backdrop is CSS on the on-screen image.
Rejected: a global "view mode" flag inside shared renderers (easy to leak into exports); a separate draw path for the live canvas (drift).
Consequence: Export call sites must never pass the canvas color. Downloads stay white or transparent.
Evidence: lib/export/render.ts; app/hooks/use-chart-renderer.ts; tests/e2e/keyboard-shortcuts.spec.ts; HANDOVER.md D87 as of commit f7bb51c.
