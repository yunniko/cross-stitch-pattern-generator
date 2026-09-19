# Algorithm review: generation, exports and the stitched view (2026-09-19)

Owner request: review the algorithms of export, photo generation and the stitched (realistic) view for logical and
efficiency problems, and ways to optimise. Every number below was measured in this session on the laptop (AMD Ryzen 5
5600H), under plain Node from a rolldown bundle, with the server's own canvas backend for exports; "host" numbers are
the G-046 M1 and M3 measurements on the production server. Each proposal says whether it keeps the output byte-identical
(safe under the golden hashes, D107), pixel-identical (a different file that decodes to the same pixels), within ±1 (an
8-bit rounding difference in anti-aliased edges), or changes the result.

## Exports

**A4 pages: the PNG encoder is 86 % of every page.** At 1000 stitches a 2480×3508 page renders in 55 ms and the canvas
library's PNG encode takes 351 ms (236 KB). A plain PNG writer over the canvas's raw RGBA bytes, checked against the
library's file pixel for pixel (0 differing bytes in every variant):

| Writer | Time | Size |
|---|---:|---:|
| `@napi-rs/canvas` `encode("png")` | 310 ms | 292 KB |
| RGB, Up filter, zlib level 3 | 112 ms | 351 KB |
| RGBA, no filter, zlib level 1 | 43 ms | 648 KB |

The filter loop is plain JS and can be tightened further; the deflate itself is 23–40 ms. On the host a page takes
about 0.8 s, so this alone would take a 1000-stitch A4 export from 126 s to roughly 40–50 s and a 1500-stitch one
(336 pages) from 268 s to about 100 s, and Export all carries two A4 sets. Pixel-identical; the best value on this list.

**The realistic preview is the largest raster the app makes, and it is uncapped.** `effectiveCellSize` still applies
the old single-side clamp (12 000 px) that the chart PNG replaced with `MAX_CHART_AREA_PX` (40 Mpx) after the
2026-09-09 review. Above about 500 stitches the preview is therefore always 12 000 px on its longer side: 12 000×8 004
= 96 Mpx = 384 MB of canvas at 1000 stitches, the same at 2000. Measured: render 1.3 s, encode 5.2 s, RSS +1 GB; M1
saw 1 992 MB of native RSS at 2000. Two fixes, one decision:
- Compose it from per-colour tiles (as the on-screen view already does since D136), one stitch row at a time, and
  stream the rows into a PNG writer: no whole-canvas allocation at all, memory of one strip. Measured tile
  composition of the whole 96 Mpx image: 0.45 s. Expected within ±1 of today's `drawImage` per stitch (the on-screen
  tiles were accepted on that basis); to verify with the same decode-and-compare harness used for the A4 writer.
- Whether the preview should keep 12 px per stitch at 1000 (96 Mpx) or take the chart's 40 Mpx cap (7 px). That is
  the Owner's call; streaming makes either affordable.

**The chart PNG spends 73 % of its drawing in symbols.** 7 052×4 803 at 1000 stitches: 7.7 s of drawing plus 2.5 s of
encoding. Split: `fillRect` per stitch 1.46 s, `fillText` per stitch 5.63 s. Drawing each palette entry's glyph once
into a tile and `drawImage`-ing it per stitch costs 1.47 s — 3.8× less — but differs from `fillText` by ±1 on 1–2 % of
bytes (premultiplied-alpha rounding), so it is not byte-identical with today's file. The PNG writer above applies here
too (34 Mpx).

**The Pattern Keeper PDF spends its time in pdf-lib's bookkeeping, not in drawing.** 155 pages in 13.3 s locally,
38.5 s live. Profile of the export: `numberToString` 3.0 s (three string conversions per operand, ~17 operands a
stitch); `PDFArray.lookup`/`PDFDict.lookupMaybe`/`asRectangle`/`PDFContext.lookup` ≈ 2.3 s, all from
`page.getHeight()`, which the adapter calls on every rect, text and line and which pdf-lib answers by re-reading the
MediaBox dictionary each time; pako deflate 1.85 s; `getUnencodedContents` 0.76 s; garbage collection 2.15 s.
- Cache the page height in `PdfCanvasAdapter`'s constructor: byte-identical, one line, about 15 %.
- Emit each page's content stream as text (the operator syntax pdf-lib writes is fixed and `numberToString` is
  `String(n)` for every value a chart produces), instead of building operator objects that are serialised later:
  byte-identical is achievable and provable with the M2 flush harness (`tests/unit/pdf-page-flush.spec.ts`); removes
  the number formatting, the object churn and most of the GC, an estimated 30–40 %.
- Set the fill colour only when it changes, and join same-colour runs into one `re`: identical rendering, different
  bytes. Batching symbols into one text object per row would cut operators further but must be re-verified in Pattern
  Keeper itself, since its grid detection reads the text.
- Node's zlib in place of pako would change the compressed bytes; only worth it after the above.

**Smaller export findings, all exact.**
- `processor/validate-export.ts` parses the chart twice (`exportRequestError` and `toExportPayload` both call
  `deserializePatternData`), and `runServerExport` serialises it, parses it and serialises it again on the client. At
  2000 stitches that is 2.67 M cells validated four times.
- Export all holds every file in memory twice (JSZip entries, then the stored bundle) and the worker's result is copied
  once more to the pool and kept five minutes; a 1500-stitch bundle is a few hundred MB resident. A streamed zip would
  bound it. Not measured this session.
- One page canvas reused across A4 pages instead of a 35 MB allocation per page would remove the native-memory churn
  that GC finalisers release late; the effect on RSS was not measured.

## Photo generation

Time at 2000 stitches, 64 colours, after M3 (self time under plain Node): Standard 14.2 s — k-means assignment 18 %,
ICM 13 %, pair evidence 11 %, denoise 7 %, GC 7 %, k-means++ seeding 7 %; Crisp 26.4 s — `fitTwoModes` 12 %, GC 12 %,
weighted worst-fit injection 9 %, ICM 9 %, assignment 9 %, pair evidence 6 %, sample collection 5 %. Host: Standard
26.5 s, Crisp 52.5 s.

**Crisp evaluates every cell's two-mode fit, and 98–99 % of them cannot be a boundary.** A cell is confident only if
its two fitted modes are at least `minModeSeparation` (0.02) apart. Both modes are weighted means of neighbourhood
samples, so they lie inside the samples' bounding box in OKLab, and the box's squared diagonal bounds their separation
from above. Cells whose box is smaller than 0.02 can be skipped before any fit, exactly. Measured, with the actual fit
run on every cell to check:

| Source | Cells | Bound below 0.02 | Confident | Confident but skippable |
|---|---:|---:|---:|---:|
| photo-like 1500×1000 @300 | 60 000 | 98.0 % | 1 202 | 0 |
| photo-like 1500×1000 @1000 | 667 000 | 99.2 % | 4 942 | 0 |
| `sample.png` @300 | 56 400 | 98.3 % | 9 | 0 |
| `sample.png` @1000 | 625 000 | 99.3 % | 2 370 | 0 |

The bound reads the same cached OKLab rows the fit reads, so its cost is bounded by sample collection's (5 %); the
fits, spreads and sharpness (about 15 %) go for the skipped cells. Estimated 3–4 s of 26 s locally at 2000 Crisp,
about 7 s on the host. Byte-identical: the evidence layer is unchanged for every cell that is evaluated, and the
skipped cells were never confident. D132 rejected a *heuristic* pre-filter (importance) that lost confident cells; this
one is a proof, not a heuristic, and the table shows zero lost.

**Crisp's quantizer is built on 2.7 M small objects.** `runCrispQuantizationStage` builds one `{oklab, weight,
cellIndex}` object per sample (plus a tuple each), a `Map` of 2.67 M non-crisp sample indices, and the weighted
quantizer then rebuilds four column arrays from the objects (`sampleColumns` ×4), builds a `Set` of 2.67 M cell indices
twice (`weightedQuantize` and `weightedKMeansQuantize` each count distinct cells) and maps every weight once more. Self
time of those functions is 3.0 s at 2000, and most of Crisp's 3.1 s of GC is theirs; the host's maxRSS at 2000 Crisp
(1 270 MB) is largely this. Building the columns once in the stage, counting distinct cells with a byte mark, and
indexing non-crisp samples with an `Int32Array` is byte-identical: the arithmetic and its order do not change.

**Standard k-means assignment is a full scan every iteration.** Up to 30 Lloyd iterations twice (before and after
reinvestment), each 2.67 M × k distance evaluations, is 2.5 s; seeding is 64 more passes (1 s). Hamerly's bound (one
lower bound per point on its second-nearest centroid, kept exact with a strict inequality that falls back to the scan
on a tie, the same discipline as D170) skips most points after the first iterations; expected 2–3× on assignment,
byte-identical. Separately, `oklabTuples` allocates 2.67 M tuples twice per generation only for `runLloyd` to flatten
them again; passing the interleaved buffer through is exact and removes that churn.

**Pair-edge evidence holds six full-resolution float planes.** `computePairEdgeEvidence` converts the whole source to
three OKLab planes and blurs each into three more before differentiating: 144 MB at 6 MP, 288 MB at the 12 MP decode
cap, the largest transient allocation in Standard generation. Processing one channel at a time (convert, blur, drop the
raw plane) is byte-identical and cuts the peak to four planes. In Crisp mode the same source is converted to OKLab a
second time by `SourceOklabRows`; sharing is possible but the row cache is bounded and the planes are not, so the
memory trade favours leaving it.

**Smaller generation findings, all exact.**
- The 3×3 medoid denoise evaluates 81 distances per cell where 36 suffice: squared distance is exactly symmetric in
  IEEE arithmetic, and each cell's sum keeps its order. About 0.5 s at 2000.
- `computeEdgeMagnitude` and `computeCellImportance` each convert every source pixel to luminance through a fresh
  tuple; the first already holds the values the second recomputes. Passing them through saves a full-image pass and
  6–12 M allocations.
- `labelRegions` allocates a stats object per component and `recolorSmallComponents` an array per component, three
  times per generation; visible (0.3 s) but not worth restructuring yet.
- ICM after M3 is 1.8 s at 2000; the next exact step would cache each cell's pair-cost total across visits, which is
  more code than the gain now justifies.

Where the Crisp changes above land, generation at 2000 Crisp on the host is estimated to fall from 52.5 s to the
high 30s; that is an estimate from local self-times, not a measurement.

## The stitched view on screen

The per-region tile composition (D136) is sound: tiles are rasterised once per palette and zoom, regions are assembled
with typed-array row copies, and stale tiles are drawn scaled until new ones land. Two small points, neither a defect:
- `drawRealisticRegion` allocates its scratch canvas and `ImageData` on every paint, while `drawStitchPixels` (the
  colour view) keeps one per size. Brush strokes in this view repaint the whole painted rectangle per pointer event, so
  the allocation repeats per event.
- Tiles are keyed on the palette array's identity, and every edit produces a new palette (counts are recomputed), so
  each stroke rebuilds all tiles. It is cheap (one small draw and read-back per colour) and the old tiles are drawn
  meanwhile; keying on the colours' RGB would avoid it.

## Logical problems, as distinct from cost

1. The realistic preview PNG has no area cap while the chart PNG has one (40 Mpx); the preview is 96 Mpx and was M1's
   memory wall. `effectiveCellSize` is the pre-review clamp the chart path retired.
2. The export request is validated by parsing the chart twice, and the client serialises it three times.
3. The PDF adapter asks pdf-lib for the page height on every operation, which is a dictionary walk each time.
4. Nothing else found that produces a wrong result; the pipeline's stages agree with their decision records.

## Suggested order

1. The A4 PNG writer (pixel-identical; the largest live win, and it shortens the deadlines D168 had to stretch).
2. The realistic preview as streamed tile rows (removes the largest allocation in the app; Owner to decide the ±1 and
   the resolution).
3. PDF: page-height cache, then the text content stream (byte-identical, provable with the M2 harness).
4. Crisp: the separation bound, then the column-based quantizer (byte-identical, golden-safe).
5. The chart PNG's glyph tiles (±1; Owner decision) and the PNG writer for it.
6. Standard k-means bounds, denoise symmetry, pair-evidence memory, shared luminance (all exact, smaller).

Probes used: temporary scripts, removed after this review; the method is the bundle-and-run one of D149.
