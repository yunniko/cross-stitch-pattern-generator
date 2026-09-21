# G-052 M3 · What each dither pattern costs and buys

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
| lines-horizontal | 0.70 | 0.3 % (+0.3) |
| lines-diagonal | 0.60 | 26.1 % (+26.1) |
| blue-noise-16 | 0.59 | 10.4 % (+10.4) |
| floyd-steinberg | 0.55 | 19.7 % (+19.7) |

### 16 colours

| Pattern | Error × | Confetti |
|---|---|---|
| none | 1.00 | 0.0 % |
| bayer-4 | 0.48 | 22.0 % (+22.0) |
| bayer-8 | 0.48 | 22.6 % (+22.6) |
| clustered-8 | 0.81 | 0.8 % (+0.8) |
| lines-horizontal | 0.63 | 0.4 % (+0.4) |
| lines-diagonal | 0.49 | 24.4 % (+24.4) |
| blue-noise-16 | 0.48 | 11.5 % (+11.5) |
| floyd-steinberg | 0.35 | 24.7 % (+24.7) |

### 32 colours

| Pattern | Error × | Confetti |
|---|---|---|
| none | 1.00 | 0.0 % |
| bayer-4 | 0.47 | 19.9 % (+19.9) |
| bayer-8 | 0.47 | 20.3 % (+20.3) |
| clustered-8 | 0.87 | 1.8 % (+1.8) |
| lines-horizontal | 0.66 | 0.7 % (+0.7) |
| lines-diagonal | 0.48 | 22.2 % (+22.2) |
| blue-noise-16 | 0.50 | 11.8 % (+11.8) |
| floyd-steinberg | 0.33 | 24.3 % (+24.3) |

## photo

The project's photo-like fixture: regions, a shading ramp, a small disc and noise.

### 8 colours

| Pattern | Error × | Confetti |
|---|---|---|
| none | 1.00 | 0.2 % |
| bayer-4 | 0.90 | 3.9 % (+3.7) |
| bayer-8 | 0.91 | 4.0 % (+3.8) |
| clustered-8 | 1.13 | 0.8 % (+0.6) |
| lines-horizontal | 1.07 | 1.4 % (+1.3) |
| lines-diagonal | 0.97 | 3.7 % (+3.6) |
| blue-noise-16 | 0.90 | 3.5 % (+3.3) |
| floyd-steinberg | 0.99 | 3.6 % (+3.4) |

### 16 colours

| Pattern | Error × | Confetti |
|---|---|---|
| none | 1.00 | 0.3 % |
| bayer-4 | 0.48 | 9.2 % (+8.9) |
| bayer-8 | 0.48 | 9.2 % (+8.8) |
| clustered-8 | 0.49 | 9.0 % (+8.6) |
| lines-horizontal | 0.50 | 8.1 % (+7.8) |
| lines-diagonal | 0.49 | 9.7 % (+9.3) |
| blue-noise-16 | 0.47 | 9.0 % (+8.7) |
| floyd-steinberg | 0.38 | 7.6 % (+7.3) |

### 32 colours

| Pattern | Error × | Confetti |
|---|---|---|
| none | 1.00 | 0.3 % |
| bayer-4 | 0.07 | 19.4 % (+19.1) |
| bayer-8 | 0.07 | 19.4 % (+19.2) |
| clustered-8 | 0.07 | 18.2 % (+17.9) |
| lines-horizontal | 0.07 | 17.3 % (+17.0) |
| lines-diagonal | 0.07 | 19.5 % (+19.2) |
| blue-noise-16 | 0.07 | 18.2 % (+17.9) |
| floyd-steinberg | 0.02 | 18.4 % (+18.1) |

## flat regions

Four flat colours with a little noise — nothing to dither, so this is where the cost shows with no gain.

### 8 colours

| Pattern | Error × | Confetti |
|---|---|---|
| none | 1.00 | 0.0 % |
| bayer-4 | 1.22 | 2.4 % (+2.4) |
| bayer-8 | 5.80 | 2.5 % (+2.5) |
| clustered-8 | 8.83 | 1.6 % (+1.6) |
| lines-horizontal | 5.78 | 1.8 % (+1.8) |
| lines-diagonal | 5.80 | 2.4 % (+2.4) |
| blue-noise-16 | 4.33 | 2.1 % (+2.1) |
| floyd-steinberg | 0.98 | 0.3 % (+0.3) |

### 16 colours

| Pattern | Error × | Confetti |
|---|---|---|
| none | 1.00 | 0.0 % |
| bayer-4 | 0.73 | 16.3 % (+16.3) |
| bayer-8 | 0.73 | 16.2 % (+16.2) |
| clustered-8 | 0.94 | 11.4 % (+11.4) |
| lines-horizontal | 0.79 | 12.8 % (+12.8) |
| lines-diagonal | 0.73 | 16.1 % (+16.1) |
| blue-noise-16 | 0.76 | 13.8 % (+13.8) |
| floyd-steinberg | 0.47 | 12.9 % (+12.9) |

### 32 colours

| Pattern | Error × | Confetti |
|---|---|---|
| none | 1.00 | 0.0 % |
| bayer-4 | 0.01 | 19.0 % (+19.0) |
| bayer-8 | 0.01 | 19.0 % (+19.0) |
| clustered-8 | 0.01 | 18.9 % (+18.9) |
| lines-horizontal | 0.01 | 19.0 % (+19.0) |
| lines-diagonal | 0.01 | 19.0 % (+19.0) |
| blue-noise-16 | 0.01 | 19.0 % (+19.0) |
| floyd-steinberg | 0.01 | 18.8 % (+18.8) |

## photo on DMC

The same photo snapped to real threads, where the palette is at its least evenly spaced.

### 8 colours

| Pattern | Error × | Confetti |
|---|---|---|
| none | 1.00 | 0.2 % |
| bayer-4 | 0.90 | 3.9 % (+3.7) |
| bayer-8 | 0.90 | 4.0 % (+3.8) |
| clustered-8 | 0.96 | 0.8 % (+0.6) |
| lines-horizontal | 0.94 | 1.4 % (+1.3) |
| lines-diagonal | 0.91 | 3.7 % (+3.6) |
| blue-noise-16 | 0.89 | 3.5 % (+3.3) |
| floyd-steinberg | 0.97 | 3.6 % (+3.4) |

### 16 colours

| Pattern | Error × | Confetti |
|---|---|---|
| none | 1.00 | 0.2 % |
| bayer-4 | 0.91 | 5.5 % (+5.3) |
| bayer-8 | 0.91 | 5.4 % (+5.2) |
| clustered-8 | 0.91 | 5.2 % (+5.0) |
| lines-horizontal | 0.93 | 5.0 % (+4.8) |
| lines-diagonal | 0.91 | 5.5 % (+5.3) |
| blue-noise-16 | 0.92 | 5.8 % (+5.6) |
| floyd-steinberg | 0.95 | 4.6 % (+4.4) |

### 32 colours

| Pattern | Error × | Confetti |
|---|---|---|
| none | 1.00 | 0.2 % |
| bayer-4 | 0.73 | 8.4 % (+8.2) |
| bayer-8 | 0.73 | 8.3 % (+8.1) |
| clustered-8 | 0.73 | 7.7 % (+7.5) |
| lines-horizontal | 0.72 | 8.1 % (+7.9) |
| lines-diagonal | 0.73 | 8.0 % (+7.8) |
| blue-noise-16 | 0.72 | 8.4 % (+8.2) |
| floyd-steinberg | 0.73 | 8.7 % (+8.5) |

## Where each pattern wins

| Pattern | Best error × | Worst error × | Added confetti | Loses to plain |
|---|---|---|---|---|
| bayer-4 | 0.01 | 1.22 | +2.4 to +22.6 pts | flat regions at 8 |
| bayer-8 | 0.01 | 5.80 | +2.5 to +22.6 pts | flat regions at 8 |
| clustered-8 | 0.01 | 8.83 | +0.5 to +18.9 pts | photo at 8, flat regions at 8 |
| lines-horizontal | 0.01 | 5.78 | +0.3 to +19.0 pts | photo at 8, flat regions at 8 |
| lines-diagonal | 0.01 | 5.80 | +2.4 to +26.1 pts | flat regions at 8 |
| blue-noise-16 | 0.01 | 4.33 | +2.1 to +19.0 pts | flat regions at 8 |
| floyd-steinberg | 0.01 | 0.99 | +0.3 to +24.7 pts | never |

The patterns fall into two groups, and the split is the useful part: the dispersed ones (Bayer, blue noise,
Floyd-Steinberg) buy the most accuracy and cost the most confetti, while the clustered and line screens cost
almost none and buy less — on a smooth ramp they still help, on a noisy photo at few colours they can lose. A
stitcher choosing by how a chart stitches rather than by how it measures wants the second group.

## Per-stitch error, and why it moves both ways

At 16 colours, each pattern's per-stitch error against the same chart undithered:

- **Worse** (dithering costs accuracy stitch by stitch, which is the trade it makes): gradient 1.47–1.74×, photo on DMC 1.00–1.04×.
- **Better**: photo 0.69–0.89×, flat regions 0.62–0.68×, photo on DMC 0.99–1.00×.

Both directions are expected, for different reasons. Dithering gives a stitch the wrong thread on purpose, which
costs per-stitch accuracy on a smooth ramp where the undithered chart was already close. But an undithered chart
also runs the optimizer, which trades colour accuracy for smoothness — so on a photo the dithered chart, which
skips it, can be closer stitch by stitch as well. The 3×3 tables above are the measure that does not mix the two.

