# D147 · Selection actions, icon buttons, and leaner chrome
Date: 2026-09-16 · Goal: G-042 M1–M2 · Status: partly superseded (superseded by: D148 for Cancel)
Context: the Owner asked for rotate and crop on a selection, a cancel that discards its work, icon buttons, a leaner colour readout, the photo input in the top panel, and no regenerate panel for a photo-free chart.
Decision: rotation and crop are pure functions beside the flips; crop merges the piece, then delegates to `resizeCanvas`. The select tool keeps the chart as each session began — from the lift, or from before a paste merges what floated — and Cancel commits it back. Selection buttons become icons whose `aria-label` keeps today's words. The swatch readout is the thread's code and name, then each difference: no brand word, no colon. The photo input moves to the top bar, keeping `id="image-input"` and its disabled-while-generating guard; `ProcessingParams` is not rendered when the chart is photo-free.
Rejected: a cancel that only drops the floating piece (the Owner chose the whole session); cropping the piece, not the chart.
Consequence: the photo-free note goes with the panel; uploads happen through the top bar.
Evidence: tests/e2e/selection-actions.spec.ts; tests/e2e/blank-chart.spec.ts; GOALS.md G-042 progress log
