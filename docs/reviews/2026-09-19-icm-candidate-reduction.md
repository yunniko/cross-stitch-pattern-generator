# ICM candidate reduction — G-046 M3 measurements (2026-09-19)

What M3 set out to do, what was measured, and what it brought. Decision: D170.

## Where ICM's time went before the change

Instrumented passes on `npm run bench`'s 2000-stitch configuration (added in M3: 3000×2000 photo-like source, 64
colours, 2,666,000 cells), Standard:

- The coarse call visits every cell in its first pass and then 1.72 M, 0.58 M, 0.29 M … cells in passes 2–8,
  about 5.6 M visits in all. The fine call visits every cell once, then under 30 k a pass: 2.75 M visits, of which
  only 5,844 change a label in its first pass.
- A CPU profile of the bundled code under plain Node (the way the processor runs it) puts about half of
  `runLocalOptimizer`'s self time in the per-label loop; the rest is gathering neighbours, the per-call pair-cost
  cache, and walking the dirty flags.

## Two exact reductions, measured against the committed code

Both were compared in one process on the same intermediates, alternating old and new five times; medians under
plain Node on the laptop (AMD Ryzen 5 5600H). Every run's output was byte-identical to the old code's.

**Neighbour labels plus each cell's nine nearest labels** (the milestone's text), with a bound that falls back to the
full scan whenever a skipped label could win or tie. Exact, and no fallback occurred in 20 M visits, but slower:

| Case | Before | Nearest lists |
|---|---:|---:|
| 1000 st / 64 col | 792 ms | 939 ms |
| 2000 st / 64 col | 3157 ms | 3574 ms |
| 2000 st / 24 col | 1963 ms | 2893 ms |
| 1000 st / 100 col | 1037 ms | 1014 ms |

Building the lists costs 1.3 s at 2000 stitches, more than one full scan of every cell, and saved only 0.9 s of
optimizer time. Rejected.

**Neighbour labels first, then a bound** (shipped). Any label no neighbour carries costs at least `total`, since its
colour term is never negative; a neighbour label strictly below `total` therefore wins outright, and the palette is
scanned only otherwise. Nothing is precomputed and no memory is added:

| Case | Before | Neighbour bound |
|---|---:|---:|
| 1000 st / 64 col | 811 ms | 464 ms |
| 2000 st / 64 col | 3083 ms | 1838 ms |
| 2000 st / 24 col | 1964 ms | 1689 ms |
| 1000 st / 100 col | 1026 ms | 461 ms |
| 300 st / 24 col | 39 ms | 34 ms |

## Generation end to end, against M1

M1's own method (`scripts/capacity-probe.ts`, bundled, one case per process in a throwaway
`docker run --cpus=3 --memory=2g node:22-alpine` on the host), old and new bundles alternating per case. The host
load rose from 0.95 to 2.69 during the run, so compare each pair, not the rows with M1's quiet-host table:

| Case | Before | After | M1 (2026-09-18) |
|---|---:|---:|---:|
| 1000 Standard | 8.2 s | 7.2 s | 8.6 s |
| 1000 Crisp | 12.9 s | 11.8 s | — |
| 1500 Standard | 16.1 s | 15.5 s | 17.7 s |
| 1500 Crisp | 33.4 s | 28.1 s | 28.4 s |
| 2000 Standard | 28.6 s | 26.5 s | 32.0 s |
| 2000 Crisp | 52.6 s | 52.5 s | 54.7 s |

Peak RSS and maxRSS are unchanged within run-to-run variation. The realised run palettes hold 14–32 colours, where
the bound gains least (compare 2000 st / 24 col above), so the end-to-end gain is 0–5 s, not ICM's 40 %.

## Where generation time goes now

Self time of the bundled probe under plain Node on the laptop, 2000 stitches, after the change:

- **Crisp** (26.4 s profiled): `fitTwoModes` 12 %, garbage collection 12 %, `weightedInjectWorstFitClusters` 9 %,
  `runLocalOptimizer` 9 %, `assignToNearestCentroid` 9 %, `computePairEdgeEvidence` 6 %, `collectWeightedSamples` 5 %.
- **Standard** (14.2 s profiled): `assignToNearestCentroid` 18 %, `runLocalOptimizer` 13 %, `computePairEdgeEvidence`
  11 %, `denoiseForQuantization` 7 %, garbage collection 7 %, `kMeansPlusPlusSeeds` 7 %.

ICM is no longer the largest stage. The next generation wins lie in k-means assignment and, for Crisp, the evidence
layer's two-mode fit and the weighted quantizer's worst-fit injection.

## Verification

- `tests/unit/icm-neighbour-bound.spec.ts`: 1,120 single calls and 160 chained coarse → fine runs against the verbatim pre-M5 optimizer — grids from 1×1,
  palettes of 2–100 colours with duplicates, tie-heavy cells, weights from zero to heavy colour and a negative one,
  and the 255 sentinel.
- Golden hashes (D107) and both M5 equivalence specs unchanged and passing.
