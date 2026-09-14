# Performance investigation: generation, photo handling and exports — 2026-09-14

Owner request (2026-09-14): find where our processes spend time and what can
make them faster. Measured on the Owner's machine (AMD Ryzen 5 5600H, 16 GB,
Windows 11, Node 22.20.0, Chromium from Playwright 1.62) at commit `9b4ee6f`.
No production code was changed. The scratch scripts lived in the session
scratchpad and are not committed; the method is described below so it can be
repeated.

## Method

- **Browser timings.** A Playwright script against a production build
  (`next build && next start`, port 30200) uploads a synthetic, photo-like
  4000×3000 JPEG (4.4 MB, generated in the page itself), generates at three
  sizes, runs every export, and reopens the saved JSON. Main-thread freezes
  were counted with a `longtask` PerformanceObserver.
- **Node stage timings.** Each `buildPattern` stage timed on a 4000×3000
  `makePhotoLikeBuffer` source (the size a phone photo reaches after the
  4000 px decode cap), at 100, 250 and 1000 stitches. The existing
  `npm run bench` uses a 1500×1000 source, which hides the stages that read
  every source pixel.
- **CPU profiles.** V8 sampling profiles (inspector API) of four scenarios,
  summarized as self time per function.
- **Experiments.** A lookup table for `srgbToLinear`, and pdf-lib drawing with
  and without `opacity`.

Single runs on one machine; expect about ±10 % run to run. All images are
synthetic (see Confidence and gaps).

## What the user waits for (browser)

| Step | 100 st / 16 col | 250 st / 32 col | 1000 st / 64 col |
|---|---:|---:|---:|
| Photo load (file → decoded buffer) | 0.7 s | 0.8 s | 0.7 s |
| Generate (click → chart shown) | 5.0 s | 5.0 s | 12.0 s |
| Export editable JSON | 0.4 s | 0.2 s | 0.3 s |
| Export OXS | 0.1 s | 0.1 s | 1.0 s |
| Export PNG color | 0.2 s | 0.4 s | 1.9 s |
| Export PNG realistic | 0.2 s | 0.6 s | 3.3 s |
| Export Pattern Keeper PDF (color) | 0.9 s | 5.0 s | **86.1 s** |
| Export A4 ZIP (color) | 0.4 s | 1.1 s | 14.3 s |
| Export all | 1.6 s | 7.8 s | **122.2 s** |
| Open saved editable JSON | 0.2 s | 0.2 s | 0.8 s |

**Main-thread freezes** (longest single long task):

| Step | 100 st | 250 st | 1000 st |
|---|---:|---:|---:|
| Photo load | 0.38 s | 0.40 s | 0.38 s |
| PDF export | 0.61 s | 4.1 s | **71.7 s** |
| Export all | 0.57 s | 3.9 s | **71.7 s** |
| PNG realistic | 0.05 s | 0.33 s | 2.8 s |
| PNG color | 0 | 0.18 s | 1.5 s |

Generation itself never freezes the page (it runs in the worker). A4 exports
yield between pages, so they are slow but not frozen. At 1000 stitches the
PDF is 43.8 MB and Export all is 227.5 MB.

## Where generation time goes (Node, 12 MP source)

| Stage | 100 st / 16 col | 250 st / 32 col | 1000 st / 64 col |
|---|---:|---:|---:|
| Photo enhancement (only with a Photo mode) | 1.9 s | 2.1 s | 1.8 s |
| `downsampleToGrid` | 3.0 s | 3.3 s | 3.3 s |
| `computeEdgeMagnitude` + `computeCellImportance` | 0.8 s | 0.8 s | 0.8 s |
| `computePairEdgeEvidence` | 4.0 s | 4.3 s | 4.5 s |
| `kMeansQuantizer` | 0.03 s | 0.15 s | 3.7 s |
| ICM (`runMultiScaleOptimizer`) | 0.04 s | 0.45 s | 8.1 s |
| Crisp only: `buildCrispEvidenceLayer` | 29.8 s | 33.3 s | 32.7 s |
| Crisp only: `runCrispQuantizationStage` | 0.06 s | 0.38 s | 9.3 s |

| End to end | 100 st | 250 st | 1000 st |
|---|---:|---:|---:|
| Standard | 7.7 s | 8.9 s | 21.9 s |
| Standard + Auto photo | 9.5 s | 10.4 s | 23.2 s |
| Standard + DMC | 8.1 s | 8.9 s | 24.7 s |
| Crisp | **42.7 s** | **42.4 s** | **60.5 s** |

For typical sizes, more than 90 % of Standard time is spent reading all
12 million source pixels, which doesn't depend on the stitch count. k-means
and ICM matter only at the largest grids. Crisp's candidate pre-filter lets
through 97 % of cells on a noisy photo-like source (7,266 of 7,500 at
100 stitches), so almost every cell gets the expensive two-colour fit.

## Root causes (CPU profiles)

| Scenario | Top self-time functions |
|---|---|
| 12 MP → 100 st, plain + Auto (20.1 s) | `srgbToLinear` **52 %**, `rgbToOklab` 7 %, `applyEnhancement` 7 %, `computePairEdgeEvidence` 6 %, `boxBlur` 4 %, `downsampleToGrid` 4 % |
| Crisp, 12 MP → 100 st (43.1 s) | `srgbToLinear` **46 %**, `fitTwoModes` 20 %, `rgbToOklab` 11 %, `collectWeightedSamples` 4 %, `extractBoundaryEvidence` 4 %, GC 3 % |
| 1.5 MP → 1000 st / 64 col (14.6 s) | `runLocalOptimizer` **43 %**, `injectWorstFitClusters` 10 %, `srgbToLinear` 9 %, `kMeansPlusPlusSeeds` 5 %, `assignToNearestCentroid` 4 % |
| Pattern Keeper PDF, 250 st (9.2 s) | pdf-lib `PDFDict.keys` **19 %**, GC 9 %, `numberToString` 7 %, validators 5 %, deflate 5 %, `newExtGState` 2 % |

- `srgbToLinear` (`lib/color/color.ts`) calls `Math.pow` for every channel of
  every source pixel. `downsampleToGrid`, `computePairEdgeEvidence` (through
  `rgbToOklab`) and Crisp's `collectWeightedSamples` each do this over the
  whole 12 MP photo, and Crisp converts overlapping neighbourhoods again for
  every cell.
- `rgbToOklab` allocates an array per call, adding garbage-collection time.
- ICM recomputes each cell's eight pair costs every pass and scores every
  palette color for every cell, although the costs are fixed per call and
  only neighbour labels plus the best-color label can win (G-023 critique).
- `PdfCanvasAdapter` passes `opacity` on every rectangle and symbol. pdf-lib
  then registers a new graphics-state entry per call, and each page's
  resource dictionary grows and is scanned linearly. The adapter also parses
  CSS colors and the font string with regular expressions on every call.
- Posting the photo to the worker is not a bottleneck: a structured clone of
  the 12 MP buffer takes 16 ms.

## Experiments

| Experiment | Result |
|---|---|
| 256-entry lookup table for `srgbToLinear` | Identical to the `Math.pow` version for all 256 inputs; 36 M conversions **2,775 ms → 35 ms**, sums bit-identical |
| pdf-lib, 10 pages × 4,800 cells, `opacity: 1` on every call vs omitted | draw 5,300 → 2,885 ms, save 932 → 526 ms, file 2.86 → 1.48 MB |
| Source shrunk before generation, 100 st / 16 col | 12 MP 7.8 s; 1600×1200 **1.3 s**, 0.1 % of cells differ; 1200×900 0.8 s, 0.7 % differ |
| Same, 250 st / 32 col | 12 MP 8.5 s; 1600×1200 1.9 s, 2.1 % differ, but 16 colors instead of 10 |

## Recommendations, ranked

Estimates are The Company's inference from the profiles above, not
measurements of the changed code.

1. **Lookup table for sRGB decoding.** Replace the per-call `Math.pow` in
   `srgbToLinear` with a 256-entry table. Output is byte-identical (the table
   holds the same doubles). Estimated to remove roughly half of Standard
   generation time on a typical photo and close to half of Crisp time. A
   one-line-scale change, verified by the existing golden hashes (D107).
2. **Take exports off the main thread and fix the PDF adapter.**
   - Omit `opacity` when it is 1, and cache parsed colors, font strings and
     glyph widths. Measured 1.8× faster drawing and half the file size. The
     PDF bytes change, so the Owner re-checks a Pattern Keeper import (D097).
   - Run PDF, PNG, A4 and Export all in a worker (`OffscreenCanvas` for the
     raster ones), which removes the 72 s freeze even before they get faster.
     This is D079's known limitation, and it's also groundwork for G-034.
   - Longer term, write each grid page's operators in one batch instead of one
     pdf-lib call per cell.
3. **Cap the source resolution to what the stitch count needs.** This matches
   the Owner's idea of shrinking photos before upload. A 1600 px longer side
   made 100-stitch generation 6× faster with 0.1 % of cells changed on the
   synthetic image. Output changes, so it needs a quality check on real photos
   (including the confetti and shape suites and Crisp's acceptance matrix)
   and a decision file with the chosen pixels-per-stitch rule. The palette
   count changing at 250 stitches (10 → 16) must be explained before adoption.
4. **Crisp evidence layer.** After the lookup table:
   - read samples into typed arrays instead of objects;
   - convert each source pixel to OKLab at most once per job instead of once
     per overlapping cell;
   - recalibrate the candidate pre-filter, which currently passes 97 % of
     cells on noisy photos.
   The first two can stay byte-identical. The pre-filter change affects
   output and goes through the Crisp acceptance matrix.
5. **ICM and k-means at large grids.** All of these keep output identical and
   go through a Codex critique and `tests/unit/m3-equivalence.spec.ts`-style
   checks:
   - cache pair costs per cell once per call;
   - score only neighbour labels plus the best-color label, keeping the
     lowest-index tie rule;
   - skip cells whose neighbours didn't change since their last evaluation;
   - move `injectWorstFitClusters` and k-means++ seeding to typed arrays with
     incremental distances.
6. **Photo enhancement** (1.8–2.1 s). Process rows in parallel workers
   (identical output), or apply it after the resolution cap from item 3.
7. **Photo load** (0.4 s freeze). Decode with `createImageBitmap` and
   `OffscreenCanvas` in a worker, resizing during decode once item 3 sets the
   target size.

Items 1, 2 and 5 keep every existing golden hash; items 3 and 4's pre-filter
change intentionally change output and need their own evidence. Most of
these fixes also cut server cost per job for G-034.

## Confidence and gaps

- All images are synthetic. The browser's JPEG and Node's `makePhotoLikeBuffer`
  are different images, so browser and Node generation times are not directly
  comparable. Real photos with larger flat areas converge faster in ICM.
- The source-shrinking quality numbers come from one synthetic image and a
  simple box shrink, not a browser's resampler. They show the potential
  speed-up, not that quality holds.
- Single runs on the Owner's machine. The production VPS (shared AMD EPYC
  vCPUs) was not measured.
- A Node test of save, open, OXS and PDF at 1000 stitches ran out of heap
  (4 GB) and produced no numbers. The browser run covers those exports.
- Peak memory was only sampled as the JS heap after generation (92–109 MB),
  not per stage.
