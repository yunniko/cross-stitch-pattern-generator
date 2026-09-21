# D198 · Dither patterns are generated data, shared by both languages
Date: 2026-09-21 · Goal: G-052 M1 · Status: active (superseded by: —)
Context: six of the seven dither patterns are threshold matrices — Bayer 4×4 and 8×8, a clustered dot screen, two line screens, a 16×16 blue-noise tile. Each is a fixed permutation of 0..n²−1, and both languages must place every stitch identically (D107).
Decision: `scripts/dither-matrices.mjs` generates all six into `lib/pipeline/dither-matrices.ts` and `rust/cs-core/data/dither-matrices.tsv`, both committed; neither language computes a matrix at runtime.
Force: requirement — byte-identical output across two languages. Matrices built at runtime would have to agree bit for bit, including the blue noise generator's PRNG.
Rejected: computing them at startup in each language (two implementations to keep in agreement, for no gain); hand-writing them into both sources (256 entries for the blue-noise tile, where a typo is a silent quality regression).
Consequence: a new pattern is added to the generator, regenerated into both files, and given a parity case. The generator asserts each matrix is a permutation of its ranks, so a broken pattern fails at generation rather than in a chart.
Evidence: scripts/dither-matrices.mjs; tests/unit/dither.spec.ts; npm run compare:rust
