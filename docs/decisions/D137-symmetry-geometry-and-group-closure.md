# D137 · Symmetry is the group the active axes generate, computed in doubled centred coordinates
Date: 2026-09-15 · Goal: G-037 M1 · Status: active (superseded by: —)
Context: symmetric painting and quick mirror need exact cell mirroring on odd, even and non-square canvases, and axis combinations must keep results symmetric.
Decision: each axis is a signed permutation matrix on `u = 2x − (W−1)`, `v = 2y − (H−1)`; the active axes generate a closed group (order 1, 2, 4 or 8, cached per axis set) and one action touches the cell's orbit. Diagonals apply only on square canvases, enforced inside the geometry. Symmetric fills flood each orbit cell's region in the pre-fill pattern and paint the union. `fillSymmetric` takes the seed and the axes, so its seeds are always a complete orbit.
Rejected: only the reflections themselves without closure (combined axes leave results asymmetric); proportional or 45° diagonals on rectangles (Owner, 2026-09-15); sequential per-seed fills (order-dependent to reason about).
Consequence: a fill on an asymmetric pattern can stay asymmetric, which tests document; callers never pass orbits by hand.
Evidence: tests/unit/symmetry.spec.ts; lib/editor/symmetry.ts; GOALS.md G-037 progress log
