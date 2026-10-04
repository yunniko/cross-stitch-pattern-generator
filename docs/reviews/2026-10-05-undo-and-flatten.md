# Undo and flatten at 1500 × 1500: measured before and after (G-094)

Date: 2026-10-05. Measured with `npx tsx --expose-gc scripts/measure-undo.ts <snapshot|document> [kinds] [fill]` on the
development machine (Windows 11, Node, one run each; times vary by a few tenths of a millisecond between runs, memory does
not). The script is in the repository so the numbers can be taken again.

**What is measured.** A chart of 1500 × 1500 stitches (the largest the app allows, 2.25 million stitches) is edited fifty
times, which fills the history to its cap of 50 steps, then undone to the start and redone to the end. "Stroke" is a
diagonal stroke 3 stitches wide and 300 long, the ordinary case. "Large edit" repaints a third of the chart in one step,
the worst ordinary case (a fill, a colour merge). "Held by the history" is the memory that stays in use because of the
history, after garbage collection, over the chart itself. Both histories end on the same chart (the script prints a
checksum of it, equal in each pair).

| Case | History | Held by the history | Commit (median / worst) | Undo (median / worst) |
|---|---|---|---|---|
| Stroke | full copies (before) | 105.4 MB | 0.01 / 0.09 ms | 0.00 / 0.01 ms |
| Stroke | recorded changes | 0.7 MB | 0.63 / 9.53 ms | 0.37 / 1.44 ms |
| Stroke, chart with half stitches | full copies (before) | 212.7 MB | 0.01 / 0.07 ms | 0.00 / 0.00 ms |
| Stroke, chart with half stitches | recorded changes | 2.9 MB | 1.19 / 10.45 ms | 0.65 / 1.20 ms |
| Large edit | full copies (before) | 105.4 MB | 0.01 / 0.07 ms | 0.00 / 0.00 ms |
| Large edit | recorded changes | 35.5 MB | 3.34 / 16.35 ms | 1.43 / 3.92 ms |

Redo costs what undo costs. The commit time of the recorded changes is the comparison of the two charts; before the
equal stretches were skipped four stitches at a time it was 5.65 ms (median) for a stroke and 11.39 ms with half stitches.

**Flatten.** With one layer, `flatten` returns the layer itself and copies nothing: 0.002 ms. With two layers of
1500 × 1500 it composes them in 12 to 18 ms (median; 23 to 27 ms worst). That second number is the cost a second layer
will bring to every edit unless the result is kept between edits; it is a measurement for the goal that adds layers, not
something this goal uses.

## What the numbers say

- The history of full copies costs nothing in time and everything in memory: 2.1 MB a step, 4.3 MB with half stitches,
  whatever the size of the edit. At the cap that is 105 to 213 MB for one open chart, and it would double with each layer.
- Recorded changes cost a comparison at each commit (about a millisecond, 17 ms at worst) and a copy of the chart at each
  undo (under 4 ms). Neither is near anything a person would notice: ending a drag already costs over 100 ms at this size
  (HANDOVER, left open from G-039).
- The memory of recorded changes follows the size of the edit. Ordinary editing holds under 3 MB. Fifty large edits in a
  row hold a third of what the copies held, and no case holds more than the copies did, because a changed stitch costs one
  byte and a copy costs one byte for every stitch.

## Not measured

The editor itself (React state, the renderer, autosave) with either history: the script measures the two history machines
on charts edited the way a tool edits them. A browser: Node's V8 is the same engine as Chrome's, but other browsers were
not measured. Charts smaller than the largest, where both histories cost less.
