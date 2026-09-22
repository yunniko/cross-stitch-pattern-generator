# D205 · A painted mark is a fifth shape, and what it leaves unpainted still fills
Date: 2026-09-22 · Goal: G-056 M1 · Status: active (superseded by: —)
Context: a texture's knobs (D203) move spacing, size and mixture, but cannot make a mark the four built-in shapes do not contain.
Decision: a stamp is `{ size, order }`, an odd-sided square of fill steps, carried in the texture and drawn as a fifth weighted shape. A stitch it names fills in that step; one it does not fills afterwards, nearest the centre first.
Force: requirement — tone is held by *ranking* a mark's cells (D201), so every cell needs an order. Leaving unpainted ones out would hole the chart; ranking them last makes a sketch a shape. Pinning a short weight list's fallback to `lump` rather than "the last shape" stops a fifth shape changing existing textures.
Rejected: a stamp as its own mode (it would not mix with rings and dots); painting on or off (a mark could then appear, never grow).
Consequence: a stamp wider than the spacing is clipped by the region a mark owns, and the painter says so.
Evidence: tests/unit/dither-texture.spec.ts; tests/e2e/dithering.spec.ts
