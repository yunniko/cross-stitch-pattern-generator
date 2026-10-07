# D351 · An edited photo is kept as a PNG of at most 16 MB
Date: 2026-10-07 · Goal: G-124 M2 · Status: active (superseded by: —)
Context: An edited photo becomes a PNG (D349), which can be larger than the original file. It is uploaded, and an export sends the chart with its photo as base64.
Decision: An edit whose PNG would pass 16 MB is refused with a message, and the photo stays as it was.
Force: requirement — the upload cap (25 MB) and the export request cap (32 MB): 16 MB is 21.4 MB of base64, leaving room for the largest chart's cells.
Rejected: a lossy fallback (not the pixels shown, D349); scaling the photo down (changes the chart's source without asking).
Consequence: raising either server cap is the only way to raise this one; `photo-step.spec.ts` holds the sums against the limits.
Evidence: lib/photo/photo-step.ts; tests/unit/photo-step.spec.ts
