# D165 · The empty-grid card owns its settings, and Create carries the confirm
Date: 2026-09-18 · Goal: G-045 · Status: active (superseded by: —)
Context: a blank chart was sized in a strip above the chart: the choice was made on the start screen, the size entered elsewhere. The design moved the settings inside the option box.
Decision: the card is a disclosure holding Width and Height steppers, a fabric count, Create and the finished-size readout; NewChartPanel is deleted from `app/components/panels.tsx`. Opening it replaces nothing, so the confirm guarding the one autosaved chart sits on Create — D162 guards the destructive act, not reaching the screen.
Rejected: keeping the strip and mirroring its fields, leaving two forms to hold in step; putting the confirm on the disclosure, which asks before anything is at stake; opening the card by default, as 1b's one rendering draws it, which puts the secondary path's form above the accented Choose a photo.
Consequence: the card holds the draft size, not the workspace, and ships collapsed — anything reaching for "Width in stitches" opens it first. By D161 that departure is a recorded choice, not drift.
Evidence: tests/e2e/blank-chart.spec.ts; tests/e2e/new-chart.spec.ts
