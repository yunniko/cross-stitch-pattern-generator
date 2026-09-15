# Move tool drag cost — investigation, 2026-09-16

Owner report: "the movement tool is still slow" (2026-09-16), after G-036 brought every other chart action under
100 ms. Research only: nothing in the app was changed. Evidence for G-039.

## What the code does today

`previewMove` (`app/hooks/use-chart-renderer.ts`) calls `paint()` for every pointer move that crosses a stitch
boundary. `paint()` is a full frame:

- it assigns `canvas.width`/`height`, which reallocates and clears the bitmap even when the size is unchanged;
- it redraws the painted rectangle — the visible view plus a quarter of it on each side, about 2.25 × the view
  area — from the pattern, every stitch fill, symbol and grid line included (`drawScene`);
- for a wrapped drag it repeats that for up to four tile offsets (`moveTileOffsets`).

Only a one-stitch strip is actually new per step. D104's whole-canvas snapshot blit was dropped when D135 moved to
the viewport canvas, and nothing replaced it for Move.

## Measured

Production build, Chromium, 1440 × 900 window, 400 × 300 stitch chart at 64 colours, 15 one-stitch steps per drag,
unthrottled. Times are wall-clock per `page.mouse.move` (includes about 2–5 ms of CDP overhead) and the sampled
profile of the whole drag.

| Case | Stitch size | Step median / worst | Commit (pointer-up → painted) | Dominant self time over 15 steps |
|---|---:|---:|---:|---|
| Color, fit zoom | 4 px | 17 / 23 ms | 41 ms | `fillRect` 9 ms, pixel blit path |
| Grid + photo, fit zoom | 4 px | 16 / 18 ms | 45 ms | `fillRect` 5 ms |
| Color, zoomed in | 11 px | 35 / 48 ms | 65 ms | `fillText` 281 ms, `fillRect` 34 ms, chart loop 35 ms |
| B&W, zoomed in | 11 px | 49 / 55 ms | 87 ms | `fillText` 324 ms, `fillRect` 31 ms, `canvas.width` 11 ms |

Symbols are 55–60 % of the drag's main-thread time once the stitch size is at or above the 6 px symbol floor.

The commit itself is cheap: shifting a 1000 × 750 `cellPalette` takes 1.74 ms, and a row-copy variant with
identical output takes 0.28 ms (`scratchpad` micro-benchmark, 20 iterations, median). The 41–87 ms above is the
React re-render plus another full repaint, not the shift.

### Not measured

Two runs of the benchmark were killed by the OS for low memory (0.4–0.8 GB free of 15.4 GB; an unrelated browser
held 6 GB), so:

- the 1000-stitch chart never completed a run; the table is a 400-stitch chart, which is the same cost per step
  once zoomed in, because the painted rectangle is bounded by the view, not the chart;
- Realistic and zoomed-in Grid + photo have no numbers. A full Grid + photo repaint measured 94–101 ms in G-036,
  so a step there is likely close to that — an inference, not a measurement;
- at the 6 px symbol floor about 3 × more symbols fit the view than at 11 px, so a step is likely above 100 ms —
  again an inference.

The benchmark used is `scripts/bench-move.spec.ts` in G-039 M1; the throwaway version lived in the session
scratchpad.

## Options

1. **Shift the pixels already on screen, redraw only the uncovered strips.** Per frame: copy the previous bitmap by
   the stitch step, then draw only the strip the wrap exposes. About 230 stitches instead of 11,700 at 11 px.
   Needs the red symmetry guides on their own overlay, or they travel with the copy.
2. **Paint only the visible view during a drag**, leaving the overscan for pointer-up: about 55 % less area.
3. **At most one paint per screen frame**, from the latest pointer position, so several events in one frame cannot
   queue several repaints and latency cannot pile up.
4. **Small fixes:** skip the canvas resize when the size is unchanged (0.7 ms/step), keep the scratch canvas and the
   parsed canvas colour instead of rebuilding them per paint, and the row-copy shift above.
5. **Drop symbols while dragging** — fastest, but it changes what the user sees; the Owner's call.

Rejected earlier and not revisited: pre-rendered symbol sprites (slower than `fillText`, D136) and moving chart
drawing to a worker (D125's scope).

## Behaviour the Owner has to rule on

- Grid lines currently travel with the design during a Move and snap back on release; the heavy 5th/10th lines
  jump visibly when the shift is not a multiple of 10. Keeping them fixed during the drag would look steadier and
  would let the release reuse the last preview frame.
- D135 records that Grid + photo drag previews are "drawn clean". Option 1 copies a clean frame and patches clean
  strips; the pixels should match, but it is no longer a full redraw per frame.
