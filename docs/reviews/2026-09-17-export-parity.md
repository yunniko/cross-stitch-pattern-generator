# Export parity: the browser build against the server build (G-034 M4)

Date: 2026-09-17 · Harness: `scripts/export-parity.spec.ts` (`npm run compare:export-parity`)

Both builds generated the same 50-stitch chart from the same photo, then every export kind and the Export all bundle
were downloaded from each and compared. The browser build ran on `.next-browser`, the server build on `.next-server`
with the processor behind it; the two were confirmed distinct behaviourally first — the browser build made no `/api`
call and left the processor's counters untouched, the server build drove `/api/exports`.

## Matched exactly

- **Editable JSON** — identical as data, alone and inside the bundle.
- **OXS** — byte-identical, alone and inside the bundle.
- **Pattern Keeper PDF** — 3 pages, per-page text identical. The PDF measures through fontkit on the embedded DejaVu
  Sans rather than through a canvas, so the server's font situation never reaches it.
- **Archive contents** — `sample_A4_color.zip` and `sample_A4_bw.zip` 3 entries each, `sample.cspzip` 12 entries.
- **Every PNG's dimensions.**

## Raster differences, measured

| File | Size | mean abs diff | pixels differing | max abs |
|---|---|---:|---:|---:|
| `sample_color.png` | 1252×958 | 3.26 | 19.3 % | 238 |
| `sample_bw.png` | 1252×958 | 3.85 | 14.2 % | 238 |
| `sample_preview.png` | 1200×744 | 1.23 | 89.8 % | 128 |
| A4 grid page | 2480×3508 | 1.17–1.47 | 2.8–3.7 % | 238 |
| A4 legend | 2480×3508 | 1.08 | 1.2 % | 238 |
| A4 extended legend | 2480×3508 | 1.25 | 1.8 % | 238 |

Differences per channel, 0–255. The harness fails above a mean of 8.

## Two causes, not one

1. **Text (D153).** The container has no Arial to resolve, so the server draws with the DejaVu Sans it already ships
   for the PDF. Glyphs are about 12 % wider and land in different places, which is why `max` reaches 238 on charts: a
   pixel that is white in one build is glyph-black in the other. This is concentrated where text is — 19.3 % of a
   symbol-covered chart, but only 1.2 % of a mostly-white legend page.
2. **Texture resampling.** The realistic preview draws no text at all, yet 89.8 % of its pixels differ, by a mean of
   1.23 levels. Chrome and `@napi-rs/canvas` scale the stitch texture with different filters. D153 does not cover this;
   it is recorded here so a future session does not re-investigate it as a fault.

## Conclusion

Dimensions, archive file lists, PDF text and both data formats match exactly. Raster output differs by a small mean
with two understood causes, both bounded by the harness. Criterion 7 is met on the measured evidence, with the caveat
that "only anti-aliasing differences" is not the right description: the differences are glyph placement and texture
resampling, small in magnitude rather than sub-pixel in kind.
