# D107 · Pipeline speed-ups must be byte-identical, proven by golden hashes
Date: 2026-09-13 · Goal: G-031 M3 · Status: active (superseded by: —)
Context: generation at the largest supported size took minutes, almost all in ICM (review E1–E7), and G-031 forbids any change to Standard-mode output.
Decision: only rewrites that keep every floating-point sum in its original order ship: ICM precomputes each cell's eight pair costs and reuses in-order partial sums per label; pair-edge evidence caches per-row derivatives instead of summed-area tables; the percentile uses exact histogram selection; `nameColors` keeps each color's k+1 nearest names; Lloyd runs on typed buffers. A golden-hash suite recorded from the pre-M3 code and an old-versus-new optimizer spec gate every change.
Rejected: summed-area tables and candidate-label restriction — faster, but they change results; mini-batch Lloyd — changes the palette.
Consequence: an intentional output change regenerates `tests/unit/fixtures/golden-hashes.json` and says so in its own decision; a speed-up that moves a hash is a bug.
Evidence: tests/unit/golden-hashes.spec.ts; tests/unit/m3-equivalence.spec.ts; docs/reviews/2026-09-13-pipeline-performance.md.
