# What the photo adjustment costs in the browser — 2026-09-26 (G-074 M2)

The four sliders have to run in the browser while a slider moves (G-074 criterion 2). M1 built the adjustment
on `gamutMapOklabToLinear`, the CSS Color 4 gamut map the rest of this project uses (D111). This is what that
turned out to cost, and what was done about it.

All figures: Node 22 on the dev machine, `tests/unit/bench*-photo-adjust.tmp.spec.ts` (temporary, not kept),
a 600×375 photo (**0.23 MP**), median of 3 runs after a warm-up. Smaller is better.

## The shipped M1 adjustment

| Sliders | Pixels leaving sRGB | Time |
| --- | --- | --- |
| gentle (b20 c15 s20 t10) | 6.4% | 145 ms |
| strong (b40 c40 s60 t30) | 27.9% | 390 ms |
| everything hard (b40 c60 s100 t80) | 49.6% | 572 ms |

That is 0.6–2.5 µs per pixel — 60–250 ms for every 0.1 MP, before any preview is painted. Scaled to a
900×600 preview it is 0.3–1.3 s per slider move.

## Where it goes

- **Not allocation.** An allocation-free rewrite of the same arithmetic measured no faster (512 ms vs 426 ms
  on a 0.6 MP buffer — within noise, slightly worse).
- **The gamut search.** It runs only on out-of-gamut pixels, and the table above tracks that share exactly.
  Each one costs ~11 binary-search steps, each calling `Math.cbrt` three times: ~1.5 µs.
- **Not the input conversion.** Caching the photo's OKLab (it does not depend on the sliders) costs 13 ms
  once and saves ~25 ms per move. Kept, but it is not the fix.

## A lattice does not work

A 3D LUT of exact adjustments with trilinear interpolation — the usual way to make this interactive —
was measured at 17³, 25³, 33³ and 49³ nodes. Worst-case error against the exact adjustment, per channel:

| Nodes | Whole cube (stride 4) | Photo |
| --- | --- | --- |
| 17³ | 162 | 30 |
| 33³ | 100 | 21 |
| 49³ | 83 | 18 |

Errors that large, converging that slowly, mean the function is not smooth: the CSS map accepts a
per-channel clip whenever it lands within `GAMUT_JND` of the chroma-reduced candidate, which is a genuine
discontinuity. Nothing interpolates across it. Rejected.

## What was done: the adjustment clips instead (D238)

Converting back with a per-channel clamp in linear sRGB, with the photo's OKLab cached:

| Sliders | Clip | Was |
| --- | --- | --- |
| gentle | 103 ms | 145 ms |
| strong | 128 ms | 390 ms |
| everything hard | 103 ms | 572 ms |

Flat, ~450 ns/pixel, and independent of how far the sliders are pushed — which is what makes a preview
budget predictable.

The difference is not only speed. `2026-09-26-photo-adjust-clip-vs-map.png` is the same photo at
"everything hard", mapped on the left and clipped on the right: the gamut map holds the red quadrant at a
pale pink, because that colour is already at the boundary for its lightness and the map answers a request
for more chroma by taking chroma away. The clip gives the vivid red the slider asked for, at the cost of
flattening the gradient inside it. For a reader dragging a saturation slider, the second is the expected
answer; for the thread matcher, which is what D111's map was chosen for, the first still is — and that code
is untouched.

Against the exact map on this photo, the clip differs by: gentle — worst 4, mean 0.01; strong — worst 43,
mean 4.2; hard — worst 118, mean 14.4. All of it in the saturated regions that leave the gamut.

## What this leaves, and what M2 did with it

~450 ns/pixel is still too slow to repaint a full preview on every pointer move. M2 therefore caps the
preview at 1440 px on the longer side (`PREVIEW_MAX_PX`), renders a quarter-size pass while a slider is
moving and the full one when it settles, and does both in a worker.

Measured in Chrome through Playwright, on a 2816x1536 photo (preview 1440x785 = 1.13 MP):

| | |
| --- | --- |
| First frame after a slider moves | 16 ms (123 ms on the first move of a photo, which builds its OKLab) |
| Sharp frame after the slider stops | 340—414 ms, of which 180 ms is the deliberate settle delay |
| What the page itself pays per slider value | 1.3 ms median, 2.6 ms worst — React, not the adjustment |
| Frames during a 60-value drag | 16.5 ms median, 19.2 ms worst, none over 100 ms |

So the picture keeps up at about 60 a second while a slider is dragged, sharpens about a third of a second
after it stops, and the page never stops answering. `tests/e2e/photo-sliders.spec.ts` keeps the last two
rows honest with loose bounds: they are there to catch the adjustment moving back onto the page's own
thread, not to police a few milliseconds of React.
