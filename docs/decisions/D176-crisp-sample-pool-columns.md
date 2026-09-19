# D176 · Crisp's weighted quantizer works on a column pool, not sample objects
Date: 2026-09-19 · Goal: G-047 M4 · Status: active (superseded by: —)
Context: the Crisp stage built one `{oklab, weight, cellIndex}` object per sample (2.7 M at 2000 stitches), a map of every plain cell's sample, and two sets of every cell index, then copied it all into columns again; most of Crisp's garbage collection and memory was this.
Decision: the stage writes a `WeightedSamplePool` of typed columns directly, and the weighted quantizer's functions take the pool; cells are grouped once with a typed lookup. The `WeightedColorSample[]` functions remain as wrappers that build a pool.
Force: judgment — the same results (golden hashes, the pre-M5 equivalence specs) with Crisp at 2000 stitches 20.6 → 15.0 s and peak RSS 717 → 420 MB.
Rejected: keeping objects and only removing the sets and map (half the saving; the objects were the allocation).
Consequence: a custom `WeightedQuantizerFn` receives a pool; `samplePoolOf` converts sample arrays.
Evidence: tests/unit/weighted-quantize.spec.ts; tests/unit/m5-equivalence.spec.ts; tests/unit/golden-hashes.spec.ts
