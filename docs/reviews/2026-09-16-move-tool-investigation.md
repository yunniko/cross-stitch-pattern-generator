# Move tool drag cost — investigation and baseline, 2026-09-16

Owner report: "the movement tool is still slow" (2026-09-16), after G-036 brought every other chart action under
100 ms. This document holds the investigation that produced G-039 and the M1 baseline it is measured against.

## What the code does today

`previewMove` (`app/hooks/use-chart-renderer.ts`) calls `paint()` for every pointer move that crosses a stitch
boundary. `paint()` is a full frame:

- it assigns `canvas.width`/`height`, which reallocates and clears the bitmap even when the size is unchanged;
- it redraws the painted rectangle — the visible view plus a quarter of it on each side, about 2.25 × the view
  area — from the pattern, every stitch fill, symbol and grid line included (`drawScene`);
- for a wrapped drag it repeats that for up to four tile offsets (`moveTileOffsets`).

Only a one-stitch strip is actually new per step. D104's whole-canvas snapshot blit was dropped when D135 moved to
the viewport canvas, and nothing replaced it for Move.

## Baseline (M1)

`npm run bench:move` (`scripts/bench-move.spec.ts`): a 1000-stitch, 64-colour chart from a synthetic 2000 × 1500
photo, 1440 × 900 window, production build, Chromium. Each case drags one stitch diagonally 15 times. A step time is
one preview frame measured from the test runner, so it carries a few ms of DevTools-protocol overhead; frame gaps
and long tasks come from inside the page. Unthrottled figures are medians across 3 runs (worst column is the worst
of all runs); the throttled pass is a single run, as G-036 reported.

| Case | Step median | Step worst | Worst frame gap | Longest task | End of drag |
|---|---:|---:|---:|---:|---:|
| Color @ 6 px | 94 ms | 114 ms | 100 ms | 100 ms | 127 ms |
| B&W @ 6 px | 97 ms | 130 ms | 100 ms | 110 ms | 134 ms |
| Grid + photo @ 6 px | 79 ms | 104 ms | 83 ms | 97 ms | 129 ms |
| Color @ 8 px | 54 ms | 81 ms | 50 ms | 65 ms | 100 ms |
| B&W @ 8 px | 65 ms | 78 ms | 50 ms | 63 ms | 95 ms |
| Grid + photo @ 8 px | 50 ms | 65 ms | 34 ms | 0 ms | 101 ms |
| Color @ 4 px (100 % zoom) | 17 ms | 25 ms | 17 ms | 0 ms | 44 ms |
| B&W @ 4 px (100 % zoom) | 17 ms | 20 ms | 17 ms | 0 ms | 49 ms |
| Grid + photo @ 4 px (100 % zoom) | 16 ms | 20 ms | 17 ms | 0 ms | 55 ms |

At 4× CPU throttling (single run): 357 / 369 / 306 ms per step at 6 px (Color / B&W / Grid + photo), 229 / 228 /
187 ms at 8 px, 34 / 33 / 33 ms at 100 % zoom; ending a drag 478–503 ms at 6 px, 275–307 ms at 8 px, 122–127 ms at
100 % zoom. No page or console errors in any run.

Reading: below the 6 px symbol floor a step already costs about one frame, and the goal's targets are met. Once
symbols are drawn, a step costs 50–97 ms — five to six frames dropped per stitch — and ending a drag sits at or just
over the 100 ms target. Symbols dominate: an earlier profile of the same drag at 11 px attributed 55–60 % of drag
time to `fillText`.

### Two corrections to the goal's criterion 1

- **11 px per stitch is unreachable on a 1000-stitch chart.** `computeCellSize` (`app/editor-geometry.ts`) caps the
  chart at 8000 px, so the longest side of 1000 stitches fixes the maximum at 8 px however far the user zooms. The
  reachable sizes are 4 px (100 % zoom), 6 px and 8 px, and the benchmark's 11 px target lands on 8 px.
- **Only three views can be dragged.** The Realistic preview and Original photo pan and zoom but never edit (D121,
  `app/workspace.tsx`), so a Move drag there is a no-op. An earlier draft of this document reported a Realistic
  "stall": the benchmark was dragging a view that ignores the gesture, and nothing repainted because nothing was
  moved. The benchmark now skips view-only modes.

### Earlier, superseded figures

The first pass used a 400-stitch chart because two 1000-stitch runs were killed by the OS for low memory. Its
numbers (35 ms per step in Color at 11 px, 49 ms in B&W) are superseded by the table above. The commit-side stitch
shift was measured separately at 1.74 ms for a 1000 × 750 chart, with a row-copy variant at 0.28 ms and identical
output — that is, the shift is not the cost; the repaint is.

## M2 result (one paint per frame, visible view only, small fixes)

Same benchmark and machine, after D144. Unthrottled medians across 3 runs, M1 → M2:

| Case | Step | Worst frame gap | Longest task | End of drag |
|---|---:|---:|---:|---:|
| Color @ 6 px | 94 → 50 ms | 100 → 33 ms | 100 → 0 ms | 127 → 134 ms |
| B&W @ 6 px | 97 → 50 ms | 100 → 33 ms | 110 → 0 ms | 134 → 124 ms |
| Grid + photo @ 6 px | 79 → 66 ms | 83 → 50 ms | 97 → 59 ms | 129 → 116 ms |
| Color @ 8 px | 54 → 33 ms | 50 → 17 ms | 65 → 0 ms | 100 → 93 ms |
| B&W @ 8 px | 65 → 33 ms | 50 → 17 ms | 63 → 0 ms | 95 → 90 ms |
| Grid + photo @ 8 px | 50 → 48 ms | 34 → 33 ms | 0 → 0 ms | 101 → 82 ms |
| Color @ 4 px (100 % zoom) | 17 → 16 ms | 17 → 17 ms | 0 → 0 ms | 44 → 52 ms |
| B&W @ 4 px (100 % zoom) | 17 → 17 ms | 17 → 17 ms | 0 → 0 ms | 49 → 45 ms |
| Grid + photo @ 4 px (100 % zoom) | 16 → 16 ms | 17 → 17 ms | 0 → 0 ms | 55 → 42 ms |

At 4× throttling (single runs), step medians M1 → M2: 357 → 181, 369 → 182 and 306 → 248 ms at 6 px; 229 → 115,
228 → 115 and 187 → 151 ms at 8 px; 34 → 27, 33 → 33 and 33 → 34 ms at 100 % zoom. Ending a drag stays within its
old range there (457–517 ms at 6 px against 478–503 before), which is a single run either side and inside the noise.

How to read a step time now: with paints coalesced to one per animation frame, the measured step returns before the
paint runs, so **the worst frame gap and the longest task are the honest metrics**. The gap tells the story — a drag
at 6 px dropped about six frames per stitch before and drops one or two now.

Notes:

- **Grid + photo gained least** (79 → 66 ms at 6 px). It already painted only a sixteenth of the view as overscan,
  so option 2 had little to give; what remains is the translucent photo under haloed symbols, which only option 1
  addresses.
- **Nothing meets the 16 ms target yet** except the 4 px case, which passed before M2. M2 was the cheap half of the
  plan; the target depends on M3 shifting the pixels already drawn.
- **Pixels are unchanged:** 124 of 124 viewport-parity cases pass, because parity draws through
  `drawSceneWithGesture` rather than `paint()` (D144).

## M3 result (shift the pixels already drawn)

Same benchmark, after D145. Unthrottled medians across 3 runs; the throttled pass is single runs, taken one stitch
size at a time from a 1200 x 900 source photo, because full runs were killed for memory (see the note at the end).

| Case | Step median, M1 → M2 → M3 | Worst step after the drag's first | Worst frame gap | End of drag |
|---|---:|---:|---:|---:|
| Color @ 6 px | 94 → 50 → **17 ms** | 23 ms | 33 ms | 132 ms |
| B&W @ 6 px | 97 → 50 → **17 ms** | 18 ms | 33 ms | 126 ms |
| Grid + photo @ 6 px | 79 → 66 → **17 ms** | 18 ms | 50 ms | 116 ms |
| Color @ 8 px | 54 → 33 → **17 ms** | 18 ms | 17 ms | 94 ms |
| B&W @ 8 px | 65 → 33 → **17 ms** | 18 ms | 17 ms | 94 ms |
| Grid + photo @ 8 px | 50 → 48 → **17 ms** | 19 ms | 33 ms | 86 ms |
| Color @ 4 px (100 % zoom) | 17 → 16 → **17 ms** | 18 ms | 17 ms | 51 ms |
| B&W @ 4 px (100 % zoom) | 17 → 17 → **17 ms** | 18 ms | 17 ms | 42 ms |
| Grid + photo @ 4 px (100 % zoom) | 16 → 16 → **17 ms** | 18 ms | 17 ms | 43 ms |

At 4× throttling, step medians M1 → M2 → M3: 357 → 181 → **33**, 369 → 182 → **33** and 306 → 248 → **33** ms at
6 px; 229 → 115 → **33**, 228 → 115 → **32** and 187 → 151 → **33** ms at 8 px; 34 → 27 → **18**, 33 → 33 → **17**
and 33 → 34 → **17** ms at 100 % zoom.

A stitch of Move now costs one display frame in every view at every reachable zoom, throttled or not.

### The one step that is not one frame

Every drag's first step still paints in full — there are no pixels to shift until a frame exists — at 34–77 ms
unthrottled and 130–275 ms at 4×. After that opening frame, **378 of 378 measured steps came in at 25 ms or under**,
almost all at 16–18 ms. Criterion 1's median target is met everywhere; its 25 ms worst-case target is met for every
step except each drag's first, which is inherent to the approach rather than a tuning problem.

### What did not improve

- **Ending a drag is unchanged** at 86–132 ms (356–372 ms at 4×), because the release redraws the committed chart
  from the pattern. At 6 px this is the one figure still over the goal's 100 ms target.
- **A drag with any symmetry axis on keeps M2's cost.** The guides are chart-fixed and would travel with the copy,
  so that case deliberately falls back to a full paint (D145).

### Measuring notes

Unthrottled figures are 3 runs of 15 steps per case on a 2000 x 1500 photo. The throttled figures are single runs in
three chunks on a 1200 x 900 photo: seven full runs were killed by the OS for memory during G-039, with 1.5–2.4 GB
free on a machine shared with other work. The chart, window and step pattern are identical across all of them, and
no run reported a page or console error.

## M4: the release frame, measured and rejected

Ending a drag was the one figure left over target (86–132 ms unthrottled, against 100 ms). The release repaints the
committed chart from the pattern, over the view plus its margin, so the attempt was to paint the visible view alone
on that frame and add the margin on the next animation frame.

Measured, it was worse, not better (unthrottled medians, 3 runs, M3 → the attempt):

| Case | End of drag |
|---|---:|
| Color @ 6 px | 132 → 231 ms |
| B&W @ 6 px | 126 → 226 ms |
| Grid + photo @ 6 px | 116 → 208 ms |
| Color @ 8 px | 94 → 154 ms |
| B&W @ 8 px | 94 → 159 ms |
| Grid + photo @ 8 px | 86 → 143 ms |

Two paints replaced one, and both fall inside the window between releasing the pointer and the chart settling. The
first pixels do arrive sooner, but the chart takes about twice as long to finish, which is the opposite of what the
change was for. It was reverted; the renderer is byte-identical to the M3 code.

**So criterion 2 is not met at a 6 px stitch.** Ending a drag costs 116–132 ms there, 86–94 ms at 8 px and 42–59 ms
at 100 % zoom. The cost is one full redraw of the committed chart, which nothing in G-039's approach removes: the
preview shows the *base* pattern translated, while the committed chart draws the *shifted* pattern with grid lines
back at their chart positions, so the last preview frame cannot be reused (D145).

## Options (G-039)

1. **Shift the pixels already on screen, redraw only the uncovered strips.** Per frame: copy the previous bitmap by
   the stitch step, then draw only the strip the wrap exposes. Needs the red symmetry guides on their own overlay,
   or they travel with the copy.
2. **Paint only the visible view during a drag**, leaving the overscan for pointer-up: about 55 % less area.
3. **At most one paint per screen frame**, from the latest pointer position, so several events in one frame cannot
   queue several repaints and latency cannot pile up.
4. **Small fixes:** skip the canvas resize when the size is unchanged, keep the scratch canvas and the parsed canvas
   colour instead of rebuilding them per paint, and the row-copy shift above.
5. **Drop symbols while dragging** — fastest, but it changes what the user sees; the Owner's call.

Rejected earlier and not revisited: pre-rendered symbol sprites (slower than `fillText`, D136) and moving chart
drawing to a worker (D125's scope).

## Behaviour the Owner has to rule on

- Grid lines currently travel with the design during a Move and snap back on release, so the heavy 5th/10th lines
  jump unless the shift is a multiple of 10. Keeping them fixed would look steadier and would let the release reuse
  the last preview frame.
- D135 records that Grid + photo drag previews are "drawn clean". Option 1 copies a clean frame and patches clean
  strips; the pixels should match, but it is no longer a full redraw per frame.

## Notes on the measuring environment

This PC ran with 0.4–2.4 GB free throughout, and four benchmark runs were killed by the OS for low memory before the
waits were time-boxed. The figures above come from runs that completed normally, with no page errors, but they were
taken alongside other work on the machine and should be re-taken on a quiet machine before being used as a
regression gate.
