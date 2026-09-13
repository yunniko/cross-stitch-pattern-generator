# D076 · Overlap bands carry no text; the legend page explains them once
Date: 2026-09-12 · Goal: Owner request · Status: active (superseded by: —)
Context: The Owner asked to remove the word OVERLAP from overlap bands in every render mode and explain it in the legend.
Decision: Remove the text in the shared overlap-band drawing, which fixes PNG Color, PNG B&W and PDF together. The simple legend page shows a tint swatch and a one-line note, only when overlap is above 0.
Rejected: per-mode removal (all three modes share one function since D074).
Consequence: Overlap explanation lives only on the legend page.
Evidence: lib/export/a4-render.ts; tests/e2e/a4-export.spec.ts; HANDOVER.md D76 as of commit f7bb51c.
