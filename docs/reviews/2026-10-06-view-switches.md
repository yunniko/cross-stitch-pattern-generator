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

