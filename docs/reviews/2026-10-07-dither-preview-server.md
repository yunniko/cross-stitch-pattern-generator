# Dither previews from Rust — compared and timed (G-100 M3, 2026-10-07)

Measured on the development machine (Windows 11) with the release build of `cs-job`, against the baseline in `docs/reviews/2026-10-07-dither-preview-baseline.md`.

## Pixel for pixel

`tests/unit/dither-preview-reference.spec.ts` holds both paths to the 61 reference pictures M1 drew with the TypeScript, which is now deleted:

- the server's preview (`cs-job dither-preview`) for every case, all 61: equal;
- the built pictures in `public/dither-previews/`: the 13 tiles and the 11 previews of patterns without settings (each the 56 × 56 chart case): equal, and the directory holds exactly those 24 files (34 KB).

So no difference between the two implementations was found anywhere. Rebuilding the pictures twice gives the same bytes; CI now rebuilds them and fails on any difference.

## How long

A pattern without settings no longer draws anything: its picture is a static file of about 1.5 KB fetched with the page's other assets, and cached. Today's drawing cost (0.1 ms for a matrix, 11 ms for a kernel, 2.8 ms for all tiles) is replaced by that fetch; a cold fetch over the network was not measured here (M5 measures it live).

The drawn marks: `npx tsx scripts/measure-dither-preview.ts 9`, the whole `cs-job` process including its spawn, median of nine:

| Chart | Before (Node, drawing only) | Now (server process) |
|---|---|---|
| 56 × 56 | 2.7 ms | 10.6 ms |
| 100 × 70 | 4.7 ms | 10.7 ms |
| 200 × 140 | 19.8 ms | 13.6 ms |
| 300 × 200 | 44 ms | 18.0 ms |
| 500 × 350 | 123 ms | 28.6 ms |
| 1000 × 700 | 494 ms | 83.4 ms |

Both wait `REDRAW_PAUSE_MS` (120 ms) first; the server's adds the request's round trip. Through the processor the 300 × 200 preview was logged at 23 ms.

## Confidence and gaps

Pixel equality is certain for the cases pinned. Times are one machine's; the production host's CPU and the round trip from a reader are not measured until M5.
