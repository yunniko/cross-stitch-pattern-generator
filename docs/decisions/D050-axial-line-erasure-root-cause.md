# D050 · Thin axial lines were erased because Sobel importance is zero on a ridge
Date: 2026-09-11 · Goal: G-022 M5.2 follow-up · Status: superseded (superseded by: D051)
Context: D049 found one-cell axial lines erased by the deployed pipeline. The Owner asked for the root cause before any fix.
Decision: The cause is the denoise stage. Sobel importance on a symmetric one-cell ridge is exactly 0, so the line is unprotected, and a 3×3 medoid over 3 line cells versus 6 background cells picks background. ICM's scan-order drift only amplified damaged input.
Rejected: boundary energy as the cause (hand calculation shows diagonal lines cost more, yet they survived); an independent ICM bug (quantizing undenoised cells gave 100 % survival through ICM).
Consequence: Protection for thin features can't rely on step-edge importance alone.
Evidence: lib/pipeline/denoise.ts; lib/pipeline/edge-map.ts; tests/unit/shape-fixtures-m5.2.spec.ts; HANDOVER.md D50 as of commit f7bb51c.
