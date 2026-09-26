# D238 · The adjustment clips rather than gamut-maps
Date: 2026-09-26 · Goal: G-074 M2 · Status: active (superseded by: —)
Context: M1 converted the adjusted OKLab back through `gamutMapOklabToLinear` (D111), like the rest of the project. Measured, that costs 145–572 ms for 0.23 MP — 0.3–1.3 s per slider move at preview size.
Decision: the four sliders convert back with a per-channel clamp in linear sRGB. `gamutMapOklabToLinear` is untouched and still serves thread matching and enhancement.
Force: requirement — criterion 2 says a slider moves the photo in the browser, and the gamut search is 8× the rest of the adjustment put together (`docs/reviews/2026-09-26-photo-adjust-cost.md`).
Rejected: a 3D LUT of exact values (worst-case error 83–162 per channel even at 49³ nodes, the map's JND acceptance being discontinuous); a worker or WASM alone (they move the cost, not remove it); previewing smaller (the cost scales with the sliders, so no size is safe).
Consequence: saturation pushed past the gamut flattens the gradient inside a blown region instead of desaturating it, which is what a slider is expected to do. Both copies clip, so parity holds.
Evidence: docs/reviews/2026-09-26-photo-adjust-cost.md; docs/reviews/2026-09-26-photo-adjust-clip-vs-map.png; tests/unit/photo-adjust.spec.ts
