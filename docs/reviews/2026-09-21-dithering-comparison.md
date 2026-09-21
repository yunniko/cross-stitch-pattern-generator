# What each dither pattern costs and buys

Measured 2026-09-21 by `scripts/dither-comparison.ts`, which regenerates this file.

Two numbers per pattern, both against the same chart undithered:

- **Error ×** — mean squared OKLab error with the photo and the chart each averaged over a 3×3 of stitches, as a
  multiple of the undithered chart's. Below 1 is better. This is the measure dithering is for: a stitched piece is
  read with neighbouring stitches together, not one at a time.
- **Confetti** — the share of stitches with no neighbour of their own colour, in percentage points added to the
  undithered chart's. This is what dithering costs a stitcher.

Per-stitch error is reported separately at the end, because it moves for two reasons at once.

## gradient

A smooth ramp in all three channels — the case dithering exists for.

### 8 colours

| Pattern | Error × | Confetti |
|---|---|---|
| none | 1.00 | 0.0 % |
| bayer-4 | 0.59 | 22.6 % (+22.6) |
| bayer-8 | 0.59 | 22.2 % (+22.2) |
| clustered-8 | 0.82 | 0.5 % (+0.5) |
| ring-8 | 0.69 | 1.4 % (+1.4) |
| lines-horizontal | 0.70 | 0.3 % (+0.3) |
| lines-diagonal | 0.60 | 26.1 % (+26.1) |
| blue-noise-16 | 0.59 | 10.4 % (+10.4) |
| floyd-steinberg | 0.55 | 19.7 % (+19.7) |
| atkinson | 0.51 | 6.8 % (+6.8) |

### 16 colours

| Pattern | Error × | Confetti |
|---|---|---|
| none | 1.00 | 0.0 % |
| bayer-4 | 0.48 | 22.0 % (+22.0) |
| bayer-8 | 0.48 | 22.6 % (+22.6) |
| clustered-8 | 0.81 | 0.8 % (+0.8) |
| ring-8 | 0.63 | 1.7 % (+1.7) |
| lines-horizontal | 0.63 | 0.4 % (+0.4) |
| lines-diagonal | 0.49 | 24.4 % (+24.4) |
| blue-noise-16 | 0.48 | 11.5 % (+11.5) |
| floyd-steinberg | 0.35 | 24.7 % (+24.7) |
| atkinson | 0.35 | 8.0 % (+8.0) |

### 32 colours

| Pattern | Error × | Confetti |
|---|---|---|
| none | 1.00 | 0.0 % |
| bayer-4 | 0.47 | 19.9 % (+19.9) |
| bayer-8 | 0.47 | 20.3 % (+20.3) |
| clustered-8 | 0.87 | 1.8 % (+1.8) |
| ring-8 | 0.65 | 3.7 % (+3.7) |
| lines-horizontal | 0.66 | 0.7 % (+0.7) |
| lines-diagonal | 0.48 | 22.2 % (+22.2) |
| blue-noise-16 | 0.50 | 11.8 % (+11.8) |
| floyd-steinberg | 0.33 | 24.3 % (+24.3) |
| atkinson | 0.36 | 7.9 % (+7.9) |

## photo

The project's photo-like fixture: regions, a shading ramp, a small disc and noise.

### 8 colours

| Pattern | Error × | Confetti |
|---|---|---|
| none | 1.00 | 0.2 % |
| bayer-4 | 0.90 | 3.9 % (+3.7) |
| bayer-8 | 0.91 | 4.0 % (+3.8) |
| clustered-8 | 1.13 | 0.8 % (+0.6) |
| ring-8 | 1.07 | 1.9 % (+1.7) |
| lines-horizontal | 1.07 | 1.4 % (+1.3) |
| lines-diagonal | 0.97 | 3.7 % (+3.6) |
| blue-noise-16 | 0.90 | 3.5 % (+3.3) |
| floyd-steinberg | 0.99 | 3.6 % (+3.4) |
| atkinson | 0.84 | 0.3 % (+0.1) |

### 16 colours

| Pattern | Error × | Confetti |
|---|---|---|
| none | 1.00 | 0.3 % |
| bayer-4 | 0.48 | 9.2 % (+8.9) |
| bayer-8 | 0.48 | 9.2 % (+8.8) |
| clustered-8 | 0.49 | 9.0 % (+8.6) |
| ring-8 | 0.47 | 8.8 % (+8.4) |
| lines-horizontal | 0.50 | 8.1 % (+7.8) |
| lines-diagonal | 0.49 | 9.7 % (+9.3) |
| blue-noise-16 | 0.47 | 9.0 % (+8.7) |
| floyd-steinberg | 0.38 | 7.6 % (+7.3) |
| atkinson | 0.30 | 6.7 % (+6.3) |

### 32 colours

| Pattern | Error × | Confetti |
|---|---|---|
| none | 1.00 | 0.3 % |
| bayer-4 | 0.07 | 19.4 % (+19.1) |
| bayer-8 | 0.07 | 19.4 % (+19.2) |
| clustered-8 | 0.07 | 18.2 % (+17.9) |
| ring-8 | 0.07 | 18.3 % (+18.1) |
| lines-horizontal | 0.07 | 17.3 % (+17.0) |
| lines-diagonal | 0.07 | 19.5 % (+19.2) |
| blue-noise-16 | 0.07 | 18.2 % (+17.9) |
| floyd-steinberg | 0.02 | 18.4 % (+18.1) |
| atkinson | 0.02 | 16.7 % (+16.4) |

## flat regions

Four flat colours with a little noise — nothing to dither, so this is where the cost shows with no gain.

### 8 colours

| Pattern | Error × | Confetti |
|---|---|---|
| none | 1.00 | 0.0 % |
| bayer-4 | 1.22 | 2.4 % (+2.4) |
| bayer-8 | 5.80 | 2.5 % (+2.5) |
| clustered-8 | 8.83 | 1.6 % (+1.6) |
| ring-8 | 2.78 | 1.5 % (+1.5) |
| lines-horizontal | 5.78 | 1.8 % (+1.8) |
| lines-diagonal | 5.80 | 2.4 % (+2.4) |
| blue-noise-16 | 4.33 | 2.1 % (+2.1) |
| floyd-steinberg | 0.98 | 0.3 % (+0.3) |
| atkinson | 0.96 | 0.7 % (+0.7) |

### 16 colours

| Pattern | Error × | Confetti |
|---|---|---|
| none | 1.00 | 0.0 % |
| bayer-4 | 0.73 | 16.3 % (+16.3) |
| bayer-8 | 0.73 | 16.2 % (+16.2) |
| clustered-8 | 0.94 | 11.4 % (+11.4) |
| ring-8 | 0.93 | 11.4 % (+11.4) |
| lines-horizontal | 0.79 | 12.8 % (+12.8) |
| lines-diagonal | 0.73 | 16.1 % (+16.1) |
| blue-noise-16 | 0.76 | 13.8 % (+13.8) |
| floyd-steinberg | 0.47 | 12.9 % (+12.9) |
| atkinson | 0.37 | 12.5 % (+12.5) |

### 32 colours

| Pattern | Error × | Confetti |
|---|---|---|
| none | 1.00 | 0.0 % |
| bayer-4 | 0.01 | 19.0 % (+19.0) |
| bayer-8 | 0.01 | 19.0 % (+19.0) |
| clustered-8 | 0.01 | 18.9 % (+18.9) |
| ring-8 | 0.01 | 18.9 % (+18.9) |
| lines-horizontal | 0.01 | 19.0 % (+19.0) |
| lines-diagonal | 0.01 | 19.0 % (+19.0) |
| blue-noise-16 | 0.01 | 19.0 % (+19.0) |
| floyd-steinberg | 0.01 | 18.8 % (+18.8) |
| atkinson | 0.01 | 18.9 % (+18.9) |

## photo on DMC

The same photo snapped to real threads, where the palette is at its least evenly spaced.

### 8 colours

| Pattern | Error × | Confetti |
|---|---|---|
| none | 1.00 | 0.2 % |
| bayer-4 | 0.90 | 3.9 % (+3.7) |
| bayer-8 | 0.90 | 4.0 % (+3.8) |
| clustered-8 | 0.96 | 0.8 % (+0.6) |
| ring-8 | 0.96 | 1.9 % (+1.7) |
| lines-horizontal | 0.94 | 1.4 % (+1.3) |
| lines-diagonal | 0.91 | 3.7 % (+3.6) |
| blue-noise-16 | 0.89 | 3.5 % (+3.3) |
| floyd-steinberg | 0.97 | 3.6 % (+3.4) |
| atkinson | 0.97 | 0.3 % (+0.1) |

### 16 colours

| Pattern | Error × | Confetti |
|---|---|---|
| none | 1.00 | 0.2 % |
| bayer-4 | 0.91 | 5.5 % (+5.3) |
| bayer-8 | 0.91 | 5.4 % (+5.2) |
| clustered-8 | 0.91 | 5.2 % (+5.0) |
| ring-8 | 0.92 | 5.1 % (+4.9) |
| lines-horizontal | 0.93 | 5.0 % (+4.8) |
| lines-diagonal | 0.91 | 5.5 % (+5.3) |
| blue-noise-16 | 0.92 | 5.8 % (+5.6) |
| floyd-steinberg | 0.95 | 4.6 % (+4.4) |
| atkinson | 0.93 | 4.1 % (+3.9) |

### 32 colours

| Pattern | Error × | Confetti |
|---|---|---|
| none | 1.00 | 0.2 % |
| bayer-4 | 0.73 | 8.4 % (+8.2) |
| bayer-8 | 0.73 | 8.3 % (+8.1) |
| clustered-8 | 0.73 | 7.7 % (+7.5) |
| ring-8 | 0.73 | 8.0 % (+7.8) |
| lines-horizontal | 0.72 | 8.1 % (+7.9) |
| lines-diagonal | 0.73 | 8.0 % (+7.8) |
| blue-noise-16 | 0.72 | 8.4 % (+8.2) |
| floyd-steinberg | 0.73 | 8.7 % (+8.5) |
| atkinson | 0.73 | 7.6 % (+7.4) |

## Where each pattern wins

| Pattern | Median error × | Median added confetti | Worst error × | Loses to plain |
|---|---|---|---|---|
| bayer-4 | 0.66 | +12.6 pts | 1.22 | flat regions at 8 |
| bayer-8 | 0.66 | +12.5 pts | 5.80 | flat regions at 8 |
| clustered-8 | 0.84 | +3.4 pts | 8.83 | photo at 8, flat regions at 8 |
| ring-8 | 0.71 | +4.3 pts | 2.78 | photo at 8, flat regions at 8 |
| lines-horizontal | 0.71 | +3.3 pts | 5.78 | photo at 8, flat regions at 8 |
| lines-diagonal | 0.66 | +12.7 pts | 5.80 | flat regions at 8 |
| blue-noise-16 | 0.66 | +9.5 pts | 4.33 | flat regions at 8 |
| floyd-steinberg | 0.51 | +10.7 pts | 0.99 | never |
| atkinson | 0.44 | +7.1 pts | 0.97 | never |

Cheapest in confetti: lines-horizontal, clustered-8, ring-8. Closest to the photo: atkinson, floyd-steinberg, blue-noise-16.
No pattern is in both lists, so the choice is a trade every time.
Never worse than the undithered chart on any fixture: floyd-steinberg, atkinson.

The threshold matrices trade along one line: those that scatter their stitches (Bayer, blue noise, the diagonal
screen) fit the photo closest and leave the most stitches standing alone, while those that cluster them (the dot,
ring and line screens) cost a stitcher least and help least — and on a noisy photo at few colours can lose
outright. The two error-diffusion kernels are off that line: they adapt to the photo rather than repeating a tile,
so they reach the lowest error of all while sitting mid-table on confetti, and neither ever loses.

## Per-stitch error, and why it moves both ways

At 16 colours, each pattern's per-stitch error against the same chart undithered:

- **Worse** (dithering costs accuracy stitch by stitch, which is the trade it makes): gradient 1.43–1.74×, photo on DMC 1.00–1.04×.
- **Better**: photo 0.54–0.89×, flat regions 0.61–0.68×, photo on DMC 0.97–1.00×.

Both directions are expected, for different reasons. Dithering gives a stitch the wrong thread on purpose, which
costs per-stitch accuracy on a smooth ramp where the undithered chart was already close. But an undithered chart
also runs the optimizer, which trades colour accuracy for smoothness — so on a photo the dithered chart, which
skips it, can be closer stitch by stitch as well. The 3×3 tables above are the measure that does not mix the two.

