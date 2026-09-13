# D017 · Legend colors get unique names from color-name-list, assigned greedily by OKLab distance
Date: 2026-09-09 · Goal: G-003 · Status: active (superseded by: —)
Context: The Owner wanted readable, unique color names without locking the app to one floss brand. Research found no licensed, brand-neutral floss naming system.
Decision: Use color-name-list's MIT "bestof" set. Score every (color, name) pair by OKLab distance and claim pairs globally, closest first, skipping taken colors or names.
Rejected: DMC codes on k-means colors (implies false precision, with licensing exposure); ntc.js (CC BY attribution, mixes paint-brand names); color-namer (unmaintained, bundles Pantone); the nearest-color package (RGB distance).
Consequence: Names are unique within one palette, not stable across generations. G-031 M3 keeps only each color's k+1 nearest names before sorting, with byte-identical output (D107).
Evidence: lib/color/color-names.ts; tests/unit/color-names.spec.ts; HANDOVER.md D17 as of commit f7bb51c.
