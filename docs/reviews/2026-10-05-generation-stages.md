# Generation before and after it became stages (G-099)

Date: 2026-10-05. Measured with `npx tsx scripts/measure-generation.ts 5` on the development machine: one fixed picture of
1600 × 1200 pixels (gradients, a hard-edged disc, stripes, a dark line, noise; the script draws it), single-threaded, the
median of five runs. The script is in the repository; it needs `cargo build --release -p cs-bench`.

"Chart" is the first twelve characters of a hash of everything the pipeline returned. It is there because the 74 golden
cases do not cover traced lines, texture strokes or a chosen set of colours; these do.

| Case | Before | After | Chart before | Chart after |
|---|---|---|---|---|
| Standard, 200 stitches, 30 colours | 240 ms | 237 ms | 632a93c7b34a | 632a93c7b34a |
| DMC threads | 236 ms | 236 ms | c68785b9edd4 | c68785b9edd4 |
| Crisp+ | 581 ms | 588 ms | 50676ba14e8e | 50676ba14e8e |
| Hand-drawn dither | 243 ms | 223 ms | 1a776c9d347a | 1a776c9d347a |
| Vivid with the photo sliders moved | 787 ms | 780 ms | 3fba1ca63569 | 3fba1ca63569 |
| Traced lines and texture strokes | 2,503 ms | 2,509 ms | 605dde9e33c1 | 605dde9e33c1 |
| A chosen set of five colours | 232 ms | 223 ms | be4eec0b8104 | be4eec0b8104 |
| Standard, 1,000 stitches | 1,232 ms | 1,276 ms | 127c1254bba4 | 127c1254bba4 |

## What the numbers say

- **Every chart is the same chart.** All eight hashes are unchanged, and the 74 recorded golden hashes pass. They were
  checked again after the proof of M3 was added and removed.
- **The time is the same within what one run differs from the next.** The largest differences are 44 ms slower on the
  1,000-stitch case (3.6 %) and 20 ms faster on the dither case; neither direction repeats across cases, and five runs
  are not enough to call either a change. Nothing in the restructure adds work: the stages run the same functions in the
  same order, and the shared state replaces local variables.
- **Where the time goes is unchanged:** the evidence of edges between neighbouring stitches for an ordinary chart, Crisp's
  own evidence for Crisp, the photo sliders when they are moved, and the overlays when they are asked for (traced lines
  and texture strokes are each over a second on this picture, and together are five times everything else).

## Not measured

More than one thread (production runs generation single-threaded per job). Memory. Other pictures: the cases were chosen
to pass through every kind of setting once, not to be typical photographs.
