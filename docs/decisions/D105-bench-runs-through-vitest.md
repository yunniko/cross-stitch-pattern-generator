# D105 · `npm run bench` runs a Vitest file, not a separate TS runner
Date: 2026-09-13 · Goal: G-031 M3 · Status: active (superseded by: —)
Context: the review asked for a committed stage timer; the project has no TypeScript runner (`tsx` is not installed) and `lib/` uses the `@/` alias, so a plain Node script cannot import the pipeline.
Decision: `scripts/bench.ts` is a Vitest file run through `vitest.bench.config.ts` (no timeout, no file parallelism, verbose reporter), outside the unit `include`, so it never runs with `npm run test:unit`. It times each stage on real intermediate data, then `buildPattern` in Standard, Crisp and DMC modes, and logs without asserting.
Rejected: adding `tsx` — a new dev dependency for one script; Vitest's `bench()` API — its warm-up iterations made the large case take several CPU-minutes per call (G-024 M6).
Consequence: timings are single runs on the machine at hand; compare runs from the same machine only. The bench's photo-like fixture lives in `tests/unit/helpers/fixtures.ts` and is shared with the golden hashes.
Evidence: scripts/bench.ts; vitest.bench.config.ts; docs/reviews/2026-09-13-pipeline-performance.md.
