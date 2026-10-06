# View switches (G-110): timings at 1,500 stitches

Measured with `SIZE=1500 RUNS=3 npm run bench:chart` (`scripts/bench-chart.spec.ts`) against a local production build
on the development machine, 64 colours. Each line is the first run; latency is from the key press to the chart's next
completed paint, and the longest task is the longest main-thread task in that span.

## Baseline (before G-110, commit faf2068: drawing unchanged)

| Step | Latency | Longest task |
| --- | --- | --- |
| Chart shown after regenerating | 3,637 ms | 51 ms |
| View: Black & white (key 2) | 139 ms | 0 ms |
| View: Stitched (key 3) | 116 ms | 0 ms |
| View: Grid + photo (key 4) | 292 ms | 108 ms |
| View: Original photo (key 5) | 82 ms | 0 ms |
| View: Color (key 1) | 100 ms | 0 ms |
| Scroll 20 steps (Color) | 508 ms | 0 ms |
| Scroll 20 steps (Grid + photo) | 683 ms | 0 ms |

The run stopped after these lines: the Isolate step and the undo-memory test still looked for the thread list in the
workspace generating leaves (Photo, since D297). Both now open Edit first; those steps are not part of G-110's
comparison and are checked again with the after-change run.

## After G-110 M2 (drawing from the switches)

Same command and machine, first run; the other two runs fall within 25 ms of it on every view step. Key 4 is now the
pattern at 50 % visibility over the photo, drawn whole into its own layer and laid over the full-strength photo; key 5
is the photo alone (visibility 0). The pattern keys leave the photo as it is, so the benchmark's order changed: the
photo is turned on last and P takes it off.

| Step | Before | After | Longest task after |
| --- | --- | --- | --- |
| Chart shown after regenerating | 3,637 ms | 3,492 ms | 58 ms |
| Black & white (key 2) | 139 ms | 117 ms | 0 ms |
| Stitched (key 3) | 116 ms | 108 ms | 0 ms |
| Color (key 1) | 100 ms | 110 ms | 0 ms |
| Color without symbols (Y) | — | 81 ms | 0 ms |
| Color with symbols again (Y) | — | 99 ms | 0 ms |
| Over the photo: Grid + photo → half visible (key 4) | 292 ms | 256 ms | 101 ms |
| Photo alone (key 5) | 82 ms | 79 ms | 0 ms |
| Photo off (P) | — | 113 ms | 0 ms |
| Scroll 20 steps (Color) | 508 ms | 507 ms | 0 ms |
| Scroll 20 steps (over the photo) | 683 ms | 549 ms | 0 ms |

Conclusion: drawing over the photo is no slower than before, and scrolling over it is about a fifth faster (the old
view drew a white halo stroke under every symbol; the new one draws the ordinary chart once into a layer). The
longest task when the photo first comes on, about 100 ms, is unchanged; that it is the photo's first decode and scale
rather than the pattern is an inference (it is the same with the old drawing and absent from key 5), not measured. Without symbols, a view change costs about a quarter less than with them. Isolate, the selection drag
and reopening a saved project, which the baseline run did not reach, completed in all three runs (Isolate on 144 ms,
off 136 ms; selection drag 376 ms; reopen 451 ms on the first run).
