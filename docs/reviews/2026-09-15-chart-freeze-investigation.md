# Chart freeze at large sizes: investigation (2026-09-15)

Owner request (2026-09-15, at G-035 sign-off): investigate why showing a generated 1000-stitch chart, or reopening a
saved one, blocks the page for about 0.5 s. Investigation only; no code was changed. Measured on the Owner's machine
against a production build of the `5ab38eb` code, with the synthetic 4000×3000 photo from `npm run bench:browser`.
The scripts were session scratch files; their method is described here.

## Answer

The freeze is the on-screen chart redraw. `useChartRenderer`'s layout effect (`app/hooks/use-chart-renderer.ts`)
resizes the canvas and calls `drawChart` (`lib/export/render.ts`), which issues one `fillRect` per stitch: 750,000
calls for a 1000 × 750 chart, all in one synchronous main-thread task. Loading, parsing and autosaving are small by
comparison.

## Method

- A Playwright script generated a 1000-stitch, 64-colour pattern, exported the editable JSON, reopened it on a fresh
  page, and recorded long tasks plus a Chrome CPU profile (100 µs sampling) for each step.
- Hot frames in the minified bundle were identified by reading the built chunks at the profiled offsets: `drawChart`,
  its `fillForCell` colour helper, the grid-line drawing, and the renderer's layout effect.
- Drawing alternatives were timed in Chromium on a synthetic 1000 × 750 chart with 14 colours.

## Profile

| Step | Long task | `fillRect` (native) | `drawChart` loop | Colour strings | Other notable work |
|---|---:|---:|---:|---:|---|
| Generate (chart shown) | 589 ms | 336 ms | 157 ms | 21 ms | autosave encode 15 ms, grid lines 6 ms |
| Reopen saved JSON | 595 ms | 374 ms | 163 ms | 11 ms | decode and JSON parsing about 30 ms, ZIP sniffing 18 ms |

At 1000 stitches the Image window uses 4 px per stitch (`computeCellSize`: 720 px ÷ 1000, clamped up to 4). That is
below the 6 px symbol floor, so no symbols are drawn: the whole cost is solid fills.

## Drawing alternatives (Chromium, median of 5)

| Method, 1000 × 750 stitches at 4 px | Time |
|---|---:|
| One `fillRect` per stitch (today) | 368 ms |
| One pixel per stitch in `ImageData`, scaled up with `drawImage` and no smoothing | 19 ms |
| Full-size `ImageData` filled per pixel | 62 ms |

Zoomed in, the canvas cap allows 8 px per stitch at 1000 stitches (8000 px ÷ 1000), which is above the symbol floor:

| Method, 1000 × 750 stitches at 8 px (median of 3) | Time |
|---|---:|
| `fillRect` per stitch | 391 ms |
| `fillRect` plus one `fillText` symbol per stitch | 1,446 ms |

Every zoom step changes the cell size and redraws the whole chart, so zooming into a large chart likely freezes for
about 1.5 s per step. This is inferred from the synthetic timing and was not measured in the app.

## Options

1. **Fill with scaled pixels when no symbols are drawn.** Below the symbol floor, write one pixel per stitch and scale
   it with nearest-neighbour `drawImage`, then draw the grid lines as today. About 20 ms instead of about 370 ms for
   the fills. Pixel parity with today's integer-aligned `fillRect` output must be verified, and the export paths that
   share `drawChart` (PNG, A4, PDF) should keep their current drawing unless they pass the same parity checks.
2. **Draw only what's visible.** Redraw the scrolled viewport, or tiles of it, instead of the whole canvas. This also
   covers the zoomed-in symbol case, where option 1 doesn't apply, but it touches scrolling, zoom anchoring (D124) and
   the incremental drawing that gestures rely on (D104).
3. **Render the chart off the main thread.** Move the on-screen canvas to a worker with
   `transferControlToOffscreen`, reusing the canvas-backend split from exports (D125). This removes the freeze in every
   case, but it is the largest change and affects every tool that draws previews into the canvas.
4. **Small, safe gain:** cache each palette entry's fill string instead of building `rgb(...)` per stitch (about
   10–20 ms of the task).

Options 1 and 4 are the smallest step for the 1000-stitch freeze. Option 2 or 3 is needed to remove the zoomed-in
symbol cost.

## Confidence and gaps

- Single profile runs on one machine and a synthetic photo; the drawing alternatives use synthetic cells.
- The zoomed-in freeze is inferred from a synthetic timing, not measured in the app.
- Option 1's pixel parity, and its effect on exports, are untested.
