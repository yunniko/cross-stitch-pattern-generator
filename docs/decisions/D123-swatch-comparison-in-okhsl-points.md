# D123 · The swatch comparison reports Okhsl lightness and saturation differences in percentage points
Date: 2026-09-13 · Goal: G-033 M3 · Status: active (superseded by: —)
Context: Stitchers swap a thread for a neighbour in the same family. The color editor shows how a hovered or focused swatch compares with the current color.
Decision: `lib/color/swatch-comparison.ts` reports the candidate's Okhsl lightness and saturation minus the current color's, in whole percentage points rounded half away from zero, omitting any part that rounds to 0. A fixed line inside the editor shows it on hover and on keyboard focus. `lib/color/okhsl.ts` is ported from Ottosson's MIT-licensed ok_color.h, with neutral colors given saturation 0.
Rejected: HSL (yellow and blue read equally light, near-black reads saturated); ratios (explode near black); native tooltips (delayed, never shown on keyboard focus); comparing hue (not asked for).
Consequence: The numbers describe catalogue sRGB on screen, not real floss. On touch screens a tap picks at once, so no comparison is shown first.
Evidence: tests/unit/okhsl.spec.ts; tests/unit/swatch-comparison.spec.ts; tests/e2e/color-editor.spec.ts
