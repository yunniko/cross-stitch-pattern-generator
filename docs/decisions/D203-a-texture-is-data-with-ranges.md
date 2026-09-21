# D203 · A texture is data with ranges, and its default is frozen
Date: 2026-09-21 · Goal: G-055 M1 · Status: active (superseded by: —)
Context: the drawn marks (D201) were nine constants. Editing them opens an infinite space of settings both languages must read identically and the processor must be able to refuse.
Decision: a `DitherTexture` of nine numbers, each with a range the editor enforces and the processor re-checks; no expression or script. The default is G-054's chart, pinned against a frozen copy of the pre-texture module (`tests/unit/helpers/dither-frozen-g054.ts`).
Force: requirement — byte-identity across the two languages rests on both reading the same numbers, and a union type cannot check a number, so validation is by range. `radiusSpan` is stored rather than a largest radius because `0.42 - 0.26` is not `0.16` in floating point, and the default would not otherwise reproduce.
Rejected: a formula editor (two languages cannot evaluate arbitrary expressions identically without a shared interpreter); clamping an out-of-range texture instead of refusing it.
Consequence: parity can only sample the space, so tone is a property test over many textures. A new knob needs a range, a Rust field and a parity case.
Evidence: tests/unit/dither-texture.spec.ts; tests/unit/dither-texture-carrying.spec.ts; scripts/rust-parity.ts
