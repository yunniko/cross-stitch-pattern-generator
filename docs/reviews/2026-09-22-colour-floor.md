# What the colour floor delivers and what it costs

Measured 2026-09-22 by `scripts/colour-floor-comparison.ts`, which regenerates this file.

The palette merge folds a colour into a near-identical one whenever the two sit within 0.02 in OKLab, and it does
so repeatedly, so a chain of merges can carry a cell much further than that single step. That is why asking for
more colours stops changing what a chart comes back with. The floor stops the merge taking a colour that already
covers at least so many stitches (G-060, D209).

Three numbers per setting, all against the same chart with the floor off:

- **Colours** — what the chart comes back with, of the number asked for.
- **Error ×** — mean squared OKLab error with the photo and the chart each averaged over a 3×3 of stitches, as a
  multiple of the unfloored chart's. Below 1 is closer to the photo.
- **Confetti** — the share of stitches with no neighbour of their own colour, in percentage points added to the
  unfloored chart's. This is what a stitcher pays.

## photo

The project's photo-like fixture: regions, a shading ramp, a small disc and noise.

### 150 stitches, asking for 48 colours

| Floor | Colours | Error × | Confetti |
|---|---|---|---|
| Off | 16 of 48 | 1.00 | 0.15 % (+0.00) |
| 50+ stitches | 24 of 48 | 0.29 | 0.25 % (+0.10) |
| 25+ stitches | 26 of 48 | 0.29 | 0.26 % (+0.11) |
| 10+ stitches | 30 of 48 | 0.28 | 0.26 % (+0.11) |
| Every colour | 40 of 48 | 0.28 | 0.29 % (+0.14) |

### 150 stitches, asking for 64 colours

| Floor | Colours | Error × | Confetti |
|---|---|---|---|
| Off | 19 of 64 | 1.00 | 0.19 % (+0.00) |
| 50+ stitches | 32 of 64 | 0.38 | 0.28 % (+0.09) |
| 25+ stitches | 35 of 64 | 0.37 | 0.28 % (+0.09) |
| 10+ stitches | 40 of 64 | 0.37 | 0.28 % (+0.09) |
| Every colour | 55 of 64 | 0.37 | 0.32 % (+0.13) |

### 400 stitches, asking for 48 colours

| Floor | Colours | Error × | Confetti |
|---|---|---|---|
| Off | 37 of 48 | 1.00 | 0.11 % (+0.00) |
| 50+ stitches | 39 of 48 | 0.95 | 0.16 % (+0.05) |
| 25+ stitches | 41 of 48 | 0.95 | 0.16 % (+0.05) |
| 10+ stitches | 42 of 48 | 0.95 | 0.16 % (+0.05) |
| Every colour | 45 of 48 | 0.95 | 0.16 % (+0.05) |

## photo on DMC

The same photo snapped to real threads, where two kept colours can still land on one skein.

### 150 stitches, asking for 48 colours

| Floor | Colours | Error × | Confetti |
|---|---|---|---|
| Off | 13 of 48 | 1.00 | 0.15 % (+0.00) |
| 50+ stitches | 13 of 48 | 0.84 | 0.18 % (+0.03) |
| 25+ stitches | 14 of 48 | 0.83 | 0.18 % (+0.03) |
| 10+ stitches | 15 of 48 | 0.83 | 0.18 % (+0.03) |
| Every colour | 20 of 48 | 0.83 | 0.16 % (+0.01) |

### 150 stitches, asking for 64 colours

| Floor | Colours | Error × | Confetti |
|---|---|---|---|
| Off | 13 of 64 | 1.00 | 0.18 % (+0.00) |
| 50+ stitches | 15 of 64 | 0.97 | 0.17 % (-0.01) |
| 25+ stitches | 15 of 64 | 0.97 | 0.17 % (-0.01) |
| 10+ stitches | 15 of 64 | 0.97 | 0.17 % (-0.01) |
| Every colour | 21 of 64 | 0.97 | 0.17 % (-0.01) |

### 400 stitches, asking for 48 colours

| Floor | Colours | Error × | Confetti |
|---|---|---|---|
| Off | 27 of 48 | 1.00 | 0.07 % (+0.00) |
| 50+ stitches | 26 of 48 | 1.00 | 0.07 % (+0.00) |
| 25+ stitches | 27 of 48 | 1.00 | 0.07 % (+0.00) |
| 10+ stitches | 27 of 48 | 1.00 | 0.07 % (+0.00) |
| Every colour | 28 of 48 | 1.00 | 0.07 % (+0.00) |

## gradient

A smooth ramp in all three channels, where every colour covers a wide band and nothing is near-duplicate.

### 150 stitches, asking for 48 colours

| Floor | Colours | Error × | Confetti |
|---|---|---|---|
| Off | 48 of 48 | 1.00 | 0.00 % (+0.00) |
| 50+ stitches | 48 of 48 | 1.00 | 0.00 % (+0.00) |
| 25+ stitches | 48 of 48 | 1.00 | 0.00 % (+0.00) |
| 10+ stitches | 48 of 48 | 1.00 | 0.00 % (+0.00) |
| Every colour | 48 of 48 | 1.00 | 0.00 % (+0.00) |

### 150 stitches, asking for 64 colours

| Floor | Colours | Error × | Confetti |
|---|---|---|---|
| Off | 64 of 64 | 1.00 | 0.00 % (+0.00) |
| 50+ stitches | 64 of 64 | 1.00 | 0.00 % (+0.00) |
| 25+ stitches | 64 of 64 | 1.00 | 0.00 % (+0.00) |
| 10+ stitches | 64 of 64 | 1.00 | 0.00 % (+0.00) |
| Every colour | 64 of 64 | 1.00 | 0.00 % (+0.00) |

### 400 stitches, asking for 48 colours

| Floor | Colours | Error × | Confetti |
|---|---|---|---|
| Off | 48 of 48 | 1.00 | 0.00 % (+0.00) |
| 50+ stitches | 48 of 48 | 1.00 | 0.00 % (+0.00) |
| 25+ stitches | 48 of 48 | 1.00 | 0.00 % (+0.00) |
| 10+ stitches | 48 of 48 | 1.00 | 0.00 % (+0.00) |
| Every colour | 48 of 48 | 1.00 | 0.00 % (+0.00) |

## flat regions

Four flat colours with a little noise — every extra colour here is a shade of one of the four.

### 150 stitches, asking for 48 colours

| Floor | Colours | Error × | Confetti |
|---|---|---|---|
| Off | 4 of 48 | 1.00 | 0.00 % (+0.00) |
| 50+ stitches | 8 of 48 | 0.99 | 0.01 % (+0.01) |
| 25+ stitches | 11 of 48 | 0.98 | 0.03 % (+0.03) |
| 10+ stitches | 12 of 48 | 0.99 | 0.04 % (+0.04) |
| Every colour | 19 of 48 | 0.98 | 0.05 % (+0.05) |

### 150 stitches, asking for 64 colours

| Floor | Colours | Error × | Confetti |
|---|---|---|---|
| Off | 4 of 64 | 1.00 | 0.00 % (+0.00) |
| 50+ stitches | 8 of 64 | 0.99 | 0.01 % (+0.01) |
| 25+ stitches | 11 of 64 | 0.98 | 0.03 % (+0.03) |
| 10+ stitches | 12 of 64 | 0.99 | 0.04 % (+0.04) |
| Every colour | 19 of 64 | 0.98 | 0.05 % (+0.05) |

### 400 stitches, asking for 48 colours

| Floor | Colours | Error × | Confetti |
|---|---|---|---|
| Off | 6 of 48 | 1.00 | 0.00 % (+0.00) |
| 50+ stitches | 23 of 48 | 0.74 | 0.03 % (+0.03) |
| 25+ stitches | 26 of 48 | 0.74 | 0.03 % (+0.03) |
| 10+ stitches | 34 of 48 | 0.74 | 0.03 % (+0.03) |
| Every colour | 44 of 48 | 0.74 | 0.04 % (+0.04) |

## What each setting does, across every case above

| Floor | Median colours kept | Median error × | Median added confetti | Cases worse than off |
|---|---|---|---|---|
| Off | 18 | 1.00 | +0.00 pts | 0 of 12 |
| 50+ stitches | 25 | 0.98 | +0.01 pts | 1 of 12 |
| 25+ stitches | 27 | 0.98 | +0.03 pts | 1 of 12 |
| 10+ stitches | 32 | 0.98 | +0.03 pts | 1 of 12 |
| Every colour | 42 | 0.98 | +0.03 pts | 1 of 12 |

Across the 48 floored cases above, 4 read further from the photo than the same chart with the floor off (photo on DMC at 400/48, up to 1.0003x).
The merge was not buying smoothness with those colours: it was spending accuracy. The floor's real cost is the
confetti column — a median of +0.03 points of single stitches — and the threads themselves, since a stitcher buys and manages every
colour the legend lists.

Two limits worth knowing, both visible above:

- **A thread brand caps it.** On DMC two kept colours can snap to one skein, so the floor delivers far fewer
  extra colours there than on the full range.
- **The merge is not the only pass that drops colours.** The optimizer and the cleanup passes reassign cells for
  structural reasons and empty some colours on the way; the floor does not touch them, by design (D209). On the
  photo at 150 stitches asking for 48 they leave 40 colours standing, which is the ceiling the floor works up to.
