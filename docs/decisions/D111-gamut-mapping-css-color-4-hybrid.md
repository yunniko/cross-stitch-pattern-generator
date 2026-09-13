# D111 · Out-of-gamut OKLab colors are mapped with the CSS Color 4 chroma-reduction hybrid
Date: 2026-09-13 · Goal: G-032 M1 · Status: active (superseded by: —)
Context: Photo enhancement can push colors outside sRGB. The existing oklabToRgb clamps each channel, which shifts hue, and its clamped output can't be used to test gamut membership.
Decision: Map by binary search on chroma at constant lightness and hue, testing membership on unclamped linear RGB, and accept the per-channel clip once it is within ΔEOK 0.02 of the candidate (ε 1e-4). The pixel pass maps only out-of-gamut pixels, once, at the end of the chain.
Rejected: per-channel clipping (hue shift); pure chroma reduction without the JND clip (bright yellows and dark blues desaturate almost fully, per Ottosson); testing gamut on oklabToRgb output (always reports in gamut, Codex's predicted first bug).
Consequence: New color code that tests gamut must use oklabToLinearRgb.
Evidence: lib/color/color.ts; lib/pipeline/enhance.ts; tests/unit/gamut-map.spec.ts; docs/domain-reference-photo-enhancement.md
