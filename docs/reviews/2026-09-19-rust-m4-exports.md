# G-048 M4 · Rust exports: equivalence and timings

Measured 2026-09-19. Fixtures are made by `scripts/rust-export-fixtures.ts`:
- photo-150: 150 stitches, 24 colours, symmetry on, an author name.
- dmc-120: 120 stitches, 32 DMC colours, Crisp.
- large-1000: 1000 stitches, 64 colours requested, 23 used.

Each fixture has an empty stitch and an unused colour. The TypeScript references were made in the production processor
image on the host (D188), by `scripts/rust-export-reference.ts`. `npm run compare:rust-exports` compares Rust against
them.

## What was ported

`rust/cs-export` covers every export kind:
- the editable save, OXS, and the colour and black-and-white chart PNGs;
- the realistic preview, streamed from per-colour tiles;
- the A4 page ZIPs, the Pattern Keeper PDF, and Export all.

Text is DejaVu Sans, shaped with rustybuzz and filled with tiny-skia (D187). The PDF follows pdf-lib's structure with a
subset Type0 font (D189). ZIPs store entries uncompressed, as JSZip does. A4 grid pages render on a rayon pool and enter
the ZIP in page order. Output is byte-identical at 1 and 4 threads (photo-150 Export all).

## Equivalence (criterion 3)

All 30 cases pass (3 fixtures × 10 kinds).

| Export | Result |
|---|---|
| Editable JSON, OXS | Byte-identical, all three fixtures (the large OXS is 26.0 MB) |
| PDF | Same page count (7, 5, 154) and the same extracted text on every page. pdfjs renders pages 1, 5 and 6 of photo-150 pixel-identical. Rust's files are 2–11 % smaller |
| Chart PNGs | Same size. Mean per-channel difference 1.14–2.04 (small fixtures), 2.74 / 4.19 (large-1000 bw / colour). Largest difference 238 everywhere |
| Realistic preview | Same size. Mean 0.14–0.33, largest 64 (small fixtures) and 85 (large-1000) |
| A4 ZIPs | Same entries (7, 5, 154). Worst page mean 0.73–1.71, largest 238 |
| Export all | Same entries (20, 16, 314). Worst entry is the chart PNG above |

**Inspected by eye:**
- Chart PNG and A4 page, small fixtures: grid lines, fills, borders and layout match exactly. The differences are only
  the anti-aliased edges of glyphs. Production's Skia hints glyphs and applies gamma, so its glyphs are heavier.
- **Chart PNG at 1000 stitches: a visible difference.** The chart cell is 7 px, so symbols are drawn at 4 px. At that
  size, production's hinted glyphs merge into small light blocks, while Rust draws the unhinted outline (a readable "×").
  - This applies to chart PNGs whose longer side is about 890–1333 stitches (cells of 6–9 px, text of 4–5 px). Above
    that no symbols are drawn; below it the text is 6 px or larger and only the edges differ.
  - The A4 pages and the PDF use fixed, larger cells and are unaffected.
  - Whether Rust's rendering is acceptable at those sizes, or even preferable, is a question for the M5 ship decision.
- The large preview (12000 × 8004) was not inspected by eye. Decoding it twice exceeds what the laptop could spare.
  Its mean difference is 0.33.

## Timings

Wall time is the fastest of 3 runs. Peak memory is the Rust process's RSS.
All three ran in the production processor image on the host, in throwaway containers capped like the processor
(`--cpus=3 --memory=2g`): TypeScript by `reference.mjs`, Rust as a static musl binary built in `rust:1.96-alpine`.
The rayon pool sizes A4 page rendering; everything else is single-threaded either way.

| Export | TS ms | Rust 1 thread | Rust 3 threads |
|---|---|---|---|
| photo-150 editable | 2 | 1 | 4 |
| photo-150 OXS | 11 | 2 (5.2×) | 25 |
| photo-150 chart PNG colour / bw | 772 / 723 | 336 / 358 (2.3× / 2.0×) | 507 / 663 |
| photo-150 preview | 412 | 261 (1.6×) | 285 |
| photo-150 A4 colour / bw | 2405 / 1860 | 1865 / 1773 (1.3× / 1.0×) | 967 / 967 (2.5× / 1.9×) |
| photo-150 PDF colour / bw | 348 / 276 | 107 / 139 (3.2× / 2.0×) | 192 / 106 |
| photo-150 Export all | 6220 | 4674 (1.3×) | 3074 (2.0×) |
| dmc-120 Export all | 4406 | 3021 (1.5×) | 2154 (2.0×) |
| large-1000 editable | 93 | 60 (1.6×) | 55 |
| large-1000 OXS | 300 | 63 (4.7×) | 77 |
| large-1000 chart PNG colour / bw | 10028 / 10489 | 1856 / 2114 (5.4× / 5.0×) | 2147 / 2180 |
| large-1000 preview | 4299 | 1843 (2.3×) | 1746 |
| large-1000 A4 colour / bw | 63413 / 66058 | 43634 / 40824 (1.5× / 1.6×) | 15355 / 15985 (4.1× / 4.1×) |
| large-1000 PDF colour / bw | 9288 / 9853 | 4814 / 4431 (1.9× / 2.2×) | 4689 / 4916 |
| large-1000 Export all | 174445 | 94193 (1.9×) | 41818 (4.2×) |

Peak RSS, Rust at one thread: 2–5 MB for the editable save, OXS, the preview and the PDF of the small fixtures; 28–40 MB
for their chart PNGs and A4 pages; 49 MB for large-1000's editable save, OXS, preview and PDF; 139 MB for its chart
PNGs, 80–82 MB for its A4 pages and 239 MB for Export all. Three threads raise A4 pages to about 150 MB (109 MB on the
small fixtures) and Export all to 257 MB, since three page canvases are live at once. TypeScript's own peak was not
measured per export.

Small-fixture numbers at 3 threads move around by a few tens of milliseconds between runs (the pool costs more to start
than the work saves on a 5-page job); the large fixture is where threading pays.

**Two Rust-side fixes came out of these timings**, both keeping output byte-identical:
- The PDF shaped every string twice per cell. Caching each string's glyph codes, its width and each colour's operands
  per document took large-1000 from 6.6 s to 2.2 s on the laptop; on the host it is now 1.9–2.2× TypeScript.
- OXS built one `String` per stitch. Writing from per-column and per-colour pieces took large-1000 from 91 ms to 10 ms
  on the laptop; on the host from 0.6× TypeScript to 4.7×.

## Two options measured and not taken

- **mimalloc instead of musl's allocator** (M3 left this open). On the pre-fix build it was worth 20–40 % on the
  allocation-heavy exports (PDF, OXS) and 7–18 % on A4 pages, at 2–5× the peak RSS on small jobs (23–75 MB against
  4–39 MB). The two fixes above removed most of that allocation traffic, so it is not needed; `cs-bench` keeps it
  behind a `mimalloc` feature for re-measuring.
- **flate2's zlib-rs backend.** 41 % faster on large-1000 A4 (19.8 s to 11.6 s on the laptop), but the files grow:
  the chart PNG from 485 KB to 784 KB (+62 %) and the PDF by 15 %. Output size is user-facing, and miniz_oxide's sizes
  match TypeScript's, so the default stays.

## Where this leaves criterion 5

On the host at the cap, against TypeScript: chart PNGs 2.0–5.4×, OXS 4.7–7.3×, the PDF 1.9–3.7×, the preview 1.2–2.3×,
Export all 1.3–2.0× at one thread and 2.0–4.2× at three, A4 pages 1.0–1.6× at one thread and 1.9–4.1× at three. The
editable save is 1.2–1.7×, on 1–93 ms jobs.

Peak memory is higher than TypeScript's in one place worth naming: Export all at 1000 stitches holds 239 MB at one
thread and 257 MB at three. M5 decides what ships, with the 4–5 px symbol difference above as the open quality question.
