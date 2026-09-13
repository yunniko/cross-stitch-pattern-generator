# Pipeline performance before and after G-031 M3 — 2026-09-13

Measured with `npm run bench` (`scripts/bench.ts`, D105) on the Owner's
Windows machine, Node 22.20.0, one run per row. Both columns use the same
photo-like synthetic sources (`tests/unit/helpers/fixtures.ts`): four broad
regions, a diagonal shading ramp, a small bright disc, and per-pixel noise
of amplitude 40. "Before" is commit `8f0b78f`, "after" is commit `9b8f692`.
Generation output is byte-identical between the two (D107): the golden
hashes recorded from `8f0b78f` pass unchanged on `9b8f692`.

This fixture is noisier than the review's. The 2026-09-12 review measured
about 170 s end to end at 1000 stitches / 64 colors; the same configuration
here took 281 s before M3.

## End to end, `buildPattern`

| Configuration | Mode | Before | After | Speed-up |
|---|---|---:|---:|---:|
| 1200×800 → 300 st / 24 col | Standard | 11,079 ms | 1,675 ms | 6.6× |
| 1200×800 → 300 st / 24 col | Crisp | 13,796 ms | 4,763 ms | 2.9× |
| 1200×800 → 300 st / 24 col | Standard + DMC | not measured | 1,885 ms | — |
| 1500×1000 → 1000 st / 64 col | Standard | 280,813 ms | **14,609 ms** | 19.2× |
| 1500×1000 → 1000 st / 64 col | Crisp | 279,647 ms | 27,423 ms | 10.2× |
| 1500×1000 → 1000 st / 64 col | Standard + DMC | not measured | 18,481 ms | — |

The G-031 acceptance target is Standard at 1000 stitches / 64 colors under
30 s. It is met at 14.6 s.

## Per stage, 1500×1000 → 1000 st / 64 col

| Stage | Before | After |
|---|---:|---:|
| `downsampleToGrid` | 1,101 ms | 1,105 ms |
| `computeEdgeMagnitude` | 133 ms | 62 ms |
| `computeCellImportance` | 51 ms | 50 ms |
| `computePairEdgeEvidence` | 3,881 ms | 915 ms |
| cell OKLab, once (`createPipelineContext`) | — | 184 ms |
| `denoiseForQuantization` | 1,590 ms | 269 ms |
| `kMeansQuantizer` | 8,821 ms | 3,384 ms |
| `runMultiScaleOptimizer` (ICM ×2) | 277,371 ms | 8,472 ms |
| `recolorSmallComponents` | 442 ms | 70 ms |
| `fixDiagonalConnections` | 332 ms | 18 ms |
| **Total of stages** | **293,721 ms** | **14,528 ms** |

## Per stage, 1200×800 → 300 st / 24 col

| Stage | Before | After |
|---|---:|---:|
| `downsampleToGrid` | 282 ms | 283 ms |
| `computeEdgeMagnitude` | 88 ms | 66 ms |
| `computeCellImportance` | 33 ms | 32 ms |
| `computePairEdgeEvidence` | 681 ms | 415 ms |
| cell OKLab, once | — | 23 ms |
| `denoiseForQuantization` | 149 ms | 38 ms |
| `kMeansQuantizer` | 280 ms | 161 ms |
| `runMultiScaleOptimizer` (ICM ×2) | 7,780 ms | 565 ms |
| `recolorSmallComponents` | 55 ms | 28 ms |
| `fixDiagonalConnections` | 22 ms | 2 ms |
| **Total of stages** | **9,370 ms** | **1,613 ms** |

## What changed

- **ICM (review E1).** Each cell's eight pair costs are computed once per
  pass; a label found among the neighbors re-sums them in stencil order
  skipping its own matches, every other label reuses the full sum. Per cell
  this is O(8 + k) instead of O(8k), with the neighbor object array gone.
- **Shared cell OKLab (E2, A3).** One interleaved Float64 conversion in
  `PipelineContext` replaces nine per-stage tuple conversions (D106).
- **Pair-edge evidence (E3).** Per-pixel derivatives are cached per source
  row instead of recomputed for each overlapping window; summation order is
  unchanged, so summed-area tables were not used.
- **Percentile (E4).** Exact histogram selection instead of sorting every
  source pixel.
- **Color naming (E5).** Each color keeps only its k+1 nearest names before
  the greedy sort.
- **Lloyd iterations.** Assignment and centroid sums run on typed buffers.
- **Worker (E6).** Reused between jobs; discarded after a native error.

Mini-batch Lloyd (goal item 6) was not needed and would change the palette.

## Verification

- `tests/unit/golden-hashes.spec.ts`: 18 `buildPattern` configurations
  (Standard/Crisp, Original/Latest, optimize on/off, DMC/Cosmo/Anchor, up
  to 300 stitches and 100 colors), hashes recorded from `8f0b78f`, all
  unchanged.
- `tests/unit/m3-equivalence.spec.ts`: the new optimizer against a verbatim
  copy of the old one on seeded random grids (including duplicate palette
  colors), a photo-like source and crisp evidence layers; `selectKth`
  against a full sort; `nameColors` against the full-sort greedy.
- Codex read-only review of the diff (2026-09-13): confirmed the ICM,
  denoise, pair-evidence and finalization rewrites bit-identical; found
  that `selectKth` mishandled NaN and −0, `nameColors` a NaN color, and
  that a worker which fired a native error was reused. All three fixed
  with tests before the M3 completion commit.

## Confidence and limits

Single runs on one machine under ordinary background load; expect ±10 %
run to run. The fixture is synthetic; real photos with larger flat areas
converge in fewer ICM passes and should be faster. Crisp mode is still
about twice Standard at the largest size, mostly in weighted quantization
and evidence extraction, which M3 did not target. Peak memory was not
measured.
