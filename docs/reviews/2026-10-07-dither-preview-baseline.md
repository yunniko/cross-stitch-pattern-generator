# Dither previews and charts before G-100 — the baseline (G-100 M1, 2026-10-07)

Measured at 4ba40a7 on the development machine (Windows 11), before any pattern moved. G-100's acceptance criteria compare against this.

## Previews, pixel for pixel

`tests/unit/fixtures/dither-previews.json` holds 61 pictures drawn by today's TypeScript (`scripts/dither-preview-reference.ts`, cases in `tests/unit/fixtures/dither-preview-cases.ts`): the 13 chooser tiles (24 × 24), the 56 × 56 preview of each of the 12 dithered patterns at chart sizes 56 × 56, 100 × 70 and 300 × 200, and four more drawn-marks textures at the same three sizes. `tests/unit/dither-preview-reference.spec.ts` holds the app's previews to them (62 of 62). Writing the reference twice gave the same bytes.

## Charts

- `npm run test:goldens:rust`: 74 of 74, every dither mode among them (`gradient/dither/*`).
- `npx tsx scripts/measure-generation.ts 5`: all eight chart hashes as recorded at G-099 in `docs/reviews/2026-10-05-generation-stages.md` (632a93c7b34a, c68785b9edd4, 50676ba14e8e, 1a776c9d347a, 3fba1ca63569, 605dde9e33c1, be4eec0b8104, 127c1254bba4).

## How long a preview takes today

`npx tsx scripts/measure-dither-preview.ts 9`, the drawing alone in Node, median of nine runs. In the app a preview appears after `REDRAW_PAUSE_MS` (120 ms) of settings at rest, plus this:

| What | Median ms |
|---|---|
| All 13 chooser tiles | 2.8 |
| Preview, any matrix pattern, 300 × 200 chart | 0.1 |
| Preview, Floyd–Steinberg or Atkinson, 300 × 200 chart | 11 |
| Preview, drawn marks, 56 × 56 / 100 × 70 / 200 × 140 chart | 2.7 / 4.7 / 19.8 |
| Preview, drawn marks, 300 × 200 / 500 × 350 / 1000 × 700 chart | 44 / 123 / 494 |

So the drawn marks appear today 125 ms to 615 ms after a slider rests, growing with the chart's area; this is what the server-drawn preview of M3 is measured against.

## Confidence and gaps

Times are Node's, not a browser's, and from one machine; the browser's JIT is of the same kind, so the order of magnitude holds, not the milliseconds. The previews are pinned as labels (which of the two tones), which is all the components draw.
