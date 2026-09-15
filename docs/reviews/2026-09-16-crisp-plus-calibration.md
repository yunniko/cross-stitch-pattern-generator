# Crisp+ calibration (G-038)

Measurements behind D139 and later G-038 milestones. The fixtures are in
`tests/unit/helpers/blend-fixtures.ts`: 60 × 40 cells at 8 source px per cell,
anti-aliased in linear light, Gaussian blur measured in cells, noise 6. They
differ slightly from the research scripts of 2026-09-15, which averaged
supersamples in sRGB, so the Crisp numbers here are close to, but not the same
as, that report's.

## M1: blurred-step evidence

From `tests/unit/crisp-plus-measure.spec.ts`, run with
`CRISP_PLUS_MEASURE=<file>`.

Region scene (198 boundary cells). "Blend" means a colour more than 0.06 OKLab
from every true region colour. "Confident" counts boundary cells in the
evidence layer. No run assigned a cell to a region outside its footprint.

| Blur (cells) | Colours | Crisp blend boundary + interior | Crisp+ blend boundary + interior | Confident, Crisp → Crisp+ |
|---:|---:|---|---|---|
| 0 | 8 | 4 + 0 | 4 + 0 | 183 → 183 |
| 0 | 16 | 5 + 0 | 5 + 0 | 183 → 183 |
| 0.1 | 8 | 5 + 0 | 4 + 0 | 183 → 184 |
| 0.1 | 16 | 6 + 0 | 5 + 0 | 183 → 184 |
| 0.25 | 8 | 91 + 0 | 6 + 0 | 0 → 184 |
| 0.25 | 16 | 94 + 0 | 6 + 0 | 0 → 184 |
| 0.5 | 8 | 110 + 0 | 52 + 8 | 0 → 59 |
| 0.5 | 16 | 107 + 8 | 53 + 8 | 0 → 59 |
| 1 | 8 | 95 + 132 | 95 + 132 | 0 → 0 |
| 1 | 16 | 121 + 145 | 121 + 145 | 0 → 0 |

Controls, Crisp → Crisp+:

- **Thin lines** (line cells kept):
  - 1 cell wide: 80/80 → 80/80 at 8 colours, and 42/80 → 49/80 at 16 colours;
  - 2 cells wide: 152/152 in every case.
- **Gradients** (ramp, radial and sky, at 8, 16 and 32 colours): 0 differing
  cells, and the same number of colours.
- **Noise:** confetti ratio 0 → 0.

At 16 colours Crisp itself loses 38 of the 80 cells of the 1-cell line, so the
thin-line criterion compares against Crisp rather than requiring every cell.

## M1 sweep: neighbourhood margin × confidence threshold

From `tests/unit/crisp-plus-sweep.spec.ts`, run with `CRISP_PLUS_SWEEP=<file>`.
Figures are at 16 colours: blend boundary + interior cells. The thin-line
columns count cells kept. "Gradient cells changed" is the total across the
three gradients at 16 and 32 colours. The noise confetti ratio was 0 in every
run.

| Margin | Threshold | Blur 0.25 | Blur 0.5 | Blur 1 | 1-cell line @8 | 1-cell line @16 | Gradient cells changed |
|---:|---:|---|---|---|---|---|---:|
| 0.75 | 0.7 | 6+0 | 53+8 | 121+145 | 80/80 | 49/80 | 0 |
| 0.75 | 0.6 | 5+0 | 29+8 | 121+145 | 72/80 | 74/80 | 0 |
| 0.75 | 0.5 | 3+0 | 19+8 | 106+146 | 72/80 | 77/80 | 0 |
| 1 | 0.7 | 10+0 | 28+0 | 118+103 | 80/80 | 44/80 | 4,592 |
| 1 | 0.6 | 6+1 | 11+0 | 108+64 | 0/80 | 0/80 | 4,592 |
| 1 | 0.5 | 6+1 | 6+0 | 86+68 | 28/80 | 30/80 | 4,592 |
| 1.25 | 0.7 | 12+0 | 17+0 | 111+67 | 75/80 | 47/80 | 4,238 |
| 1.25 | 0.6 | 9+0 | 13+1 | 82+66 | 0/80 | 0/80 | 4,488 |
| 1.25 | 0.5 | 9+4 | 6+2 | 29+13 | 0/80 | 0/80 | 4,488 |
| 1.5 | 0.7 | 15+0 | 20+0 | 81+57 | 0/80 | 0/80 | 4,707 |
| 1.5 | 0.6 | 12+0 | 13+0 | 50+27 | 0/80 | 0/80 | 4,707 |
| 1.5 | 0.5 | 9+4 | 6+2 | 14+11 | 0/80 | 7/80 | 4,707 |

The 2-cell line kept 152/152 in every run. Only margin 0.75 with threshold 0.7
leaves every control as Crisp draws it, so M1 ships that setting. Half-cell and
one-cell blurs are left to M2's snapping pass.

## M2: transition-strip snapping

### Sweep of the snapping options

From `tests/unit/crisp-plus-snap-sweep.spec.ts`, run with
`CRISP_PLUS_SNAP_SWEEP=<file>`.

- "Blur" cells show blend boundary + interior cells, then wrong-region cells
  (w) and blend palette entries (p).
- Gradient cells are **reassigned** cells (`compareAssignments`), summed over
  ramp, radial and sky at 8, 16 and 32 colours, with the ramp's mid-height
  seam rows excluded.
- No variant lost a thin-line cell against Crisp.

| Perpendicular | Span | Side run | Blur 0.5 @8 | Blur 1 @8 | Blur 0.5 @16 | Blur 1 @16 | Gradient cells |
|---:|---:|---:|---|---|---|---|---:|
| 0.15 | 5 | 2 | 4+0 w0 p2 | 26+9 w6 p3 | 4+0 w0 p2 | 21+28 w4 p5 | 2 |
| 0.15 | 5 | 3 | 3+0 w0 p1 | 25+10 w5 p4 | 2+0 w0 p1 | 29+29 w3 p4 | 0 |
| 0.25 | 5 | 2 | 1+0 w0 p1 | 7+1 w6 p3 | 2+0 w0 p1 | 20+29 w4 p4 | 2 |
| **0.25** | **5** | **3** | **0+0 w0 p0** | **4+3 w5 p4** | **0+0 w0 p0** | **28+30 w3 p4** | **0** |
| 0.25 | 7 | 3 | 0+0 w0 p0 | 4+3 w6 p4 | 0+0 w0 p0 | 24+30 w3 p4 | 0 |
| 0.35 | 5 | 2 | 1+0 w0 p1 | 7+1 w6 p3 | 1+0 w0 p1 | 10+6 w15 p3 | 2 |
| 0.35 | 5 | 3 | 0+0 w0 p0 | 4+3 w5 p4 | 0+0 w0 p0 | 83+197 w11 p4 | 0 |

Sharpness gate (with the other options at 0.15 / 5 / 2):

| Sharpness | Blur 0.5 @8 | Blur 1 @8 | Blur 0.5 @16 | Blur 1 @16 | Gradient cells |
|---:|---|---|---|---|---:|
| 0.65 | 3+0 w0 p1 | 18+8 w7 p3 | 3+0 w0 p2 | 17+28 w3 p3 | 38 |
| 0.75 | 4+0 w0 p2 | 26+9 w6 p3 | 4+0 w0 p2 | 21+28 w4 p5 | 2 |
| 0.85 | 15+0 w0 p4 | 31+12 w5 p4 | 15+0 w0 p7 | 33+33 w4 p6 | 0 |

Chosen, in bold: perpendicular 0.25, span 5, side run 3, sharpness 0.75
(D140). Before the chosen settings, a diagnosis found that raw RGB comparisons
had overstated gradient damage: the ramp's 159–404 "differing" cells were
palette colours shifting by at most 4/255 after the recompute. Only 25–29 cells
were actually reassigned, all at the ramp's seam.

### Results with the chosen settings

Full-range palette, region scene: blend boundary + interior cells, and
wrong-region cells.

| Blur (cells) | Colours | Crisp | Crisp+ | Crisp+ wrong region |
|---:|---:|---|---|---:|
| 0 | 8 | 4 + 0 | 0 + 0 | 0 |
| 0 | 16 | 5 + 0 | 1 + 0 | 0 |
| 0.1 | 8 | 5 + 0 | 0 + 0 | 0 |
| 0.1 | 16 | 6 + 0 | 0 + 0 | 0 |
| 0.25 | 8 | 91 + 0 | 0 + 0 | 0 |
| 0.25 | 16 | 94 + 0 | 0 + 0 | 0 |
| 0.5 | 8 | 110 + 0 | 0 + 0 | 0 |
| 0.5 | 16 | 107 + 8 | 0 + 0 | 0 |
| 1 | 8 | 95 + 132 | 4 + 3 | 5 |
| 1 | 16 | 121 + 145 | 28 + 30 | 3 |

Controls:

- **Thin lines:** as in M1 (1-cell line 80/80 at 8 colours and 49/80 at 16,
  2-cell line 152/152).
- **Gradients:** 0 cells reassigned outside the ramp seam.
- **Noise:** confetti ratio 0.

What remains at a one-cell blur:

- The wrong-region cells are the rectangle's corners, which a one-cell blur
  rounds into the background in the photo itself.
- The 16-colour interior blends sit on palette colours that mix three regions,
  so they lie off any two-colour line.

**Snapped cells in the palette recompute.** Each snapped cell counts as the
colour of the side it joined, not as its own blended colour. Without this,
Cosmo at a one-cell blur came out worse than Crisp:

| Cosmo, blur 1 | Crisp | Crisp+ before | Crisp+ after |
|---|---|---|---|
| 8 colours | 53 + 77 | 114 + 176 | 43 + 1 |
| 16 colours | 100 + 86 | 133 + 204 | 60 + 30 |

### Thread palettes

From `tests/unit/crisp-plus-threads-measure.spec.ts`, run with
`CRISP_PLUS_THREADS_MEASURE=<file>`. Blends are judged against each region
colour's nearest thread (Anchor uses DMC RGB). Figures are blend boundary +
interior cells.

| Blur | Brand | Colours | Crisp | Crisp+ | Palette size, Crisp → Crisp+ |
|---:|---|---:|---|---|---|
| 0.25 | DMC | 8 | 71 + 0 | 0 + 0 | 8 → 4 |
| 0.25 | DMC | 16 | 76 + 0 | 0 + 0 | 14 → 5 |
| 0.25 | Cosmo | 8 | 62 + 0 | 0 + 0 | 8 → 4 |
| 0.25 | Cosmo | 16 | 59 + 0 | 0 + 0 | 12 → 5 |
| 0.5 | DMC | 8 | 78 + 0 | 86 + 176 | 7 → 4 |
| 0.5 | DMC | 16 | 135 + 177 | 86 + 176 | 9 → 4 |
| 0.5 | Cosmo | 8 | 74 + 0 | 0 + 0 | 7 → 4 |
| 0.5 | Cosmo | 16 | 76 + 68 | 0 + 0 | 11 → 4 |
| 1 | DMC | 8 | 128 + 302 | 128 + 204 | 7 → 7 |
| 1 | DMC | 16 | 159 + 274 | 145 + 231 | 10 → 7 |
| 1 | Cosmo | 8 | 53 + 77 | 43 + 1 | 8 → 6 |
| 1 | Cosmo | 16 | 100 + 86 | 60 + 30 | 10 → 8 |

Anchor matches DMC row for row.

**DMC at half-cell blur, 8 colours.** The 176 interior cells are the whole
yellow band, stitched in DMC 3820 (223,182,95) rather than 725 (255,200,64).
3820 is 0.062 OKLab from the true colour and 725 is 0.039. Crisp picks 725 at
8 colours and 3820 at 16, so this is a one-step thread choice near a threshold,
not a blend. It remains open for M3's palette work.

**Rejected: a tighter plateau level for the M1 modes** (0.05 instead of 0.12).
- It didn't change the band's thread.
- Confident boundary cells fell from 184 to 158 at blur 0.25, and from 59 to 0
  at blur 0.5.
- Wrong-region cells rose to 20–21 for DMC and Cosmo at blur 0.5 with 8
  colours.
- The ramp gained 18 differing cells.

**Freed palette slots stay free.** Palettes shrink where blend colours emptied,
for example DMC at a quarter-cell blur goes from 8 to 4 colours; the requested
count is never exceeded.

## M3: blend-label pruning

From `tests/unit/crisp-plus-prune-sweep.spec.ts`, run with
`CRISP_PLUS_PRUNE_SWEEP=<file>`, on the full-range region scene at a one-cell
blur. Cells show blend boundary + interior cells, wrong-region cells (w) and
blend palette entries (p). "Lines lost" is thin-line cells lost against Crisp
(1-cell and 2-cell lines together). "Gradient cells" is reassigned cells over
ramp, radial and sky at 8, 16 and 32 colours, excluding the ramp seam.

| Gradient std | Flat share | Radius | Blur 1 @8 | Lines lost @8 | Blur 1 @16 | Lines lost @16 | Gradient cells |
|---:|---:|---:|---|---:|---|---:|---:|
| no pruning | | | 4+3 w5 p4 | 0 | 28+30 w3 p4 | 0 | 0 |
| 0.06 | 0.1 | 2 | 2+1 w6 p1 | 80 | 28+29 w4 p3 | 42 | 17 |
| 0.06 | 0.25 | 3 | 2+1 w6 p1 | 80 | 28+29 w4 p3 | 42 | 249 |
| **0.1** | **0.25** | **2** | **2+1 w6 p1** | **0** | **28+29 w4 p3** | **0** | **0** |
| 0.1 | 0.1 | 3 | 2+1 w6 p1 | 0 | 28+29 w4 p3 | 0 | 0 |
| 0.15 | 0.25 | 2 | 4+3 w5 p4 | 0 | 28+30 w3 p4 | 0 | 0 |

- **Chosen (bold):** gradient threshold 0.1, flat share 0.25, radius 2
  (D141). The other 0.1 rows gave the same numbers.
- **The first design** averaged the within-cell deviation over all of a
  colour's cells. It erased both thin lines, 80 and 152 cells, because
  diagonal-line cells straddle an edge.
- **Blurs of 0.5 cell or less** are unchanged by pruning: 0 blends at 8 and 16
  colours.
- **At a one-cell blur with 16 colours**, pruning barely helps (30 → 29
  interior). Those blends sit on colours that mix three regions, and their
  cells are not thin bands, so they are not candidates.

Thread palettes with pruning, blur 1 cell (blend boundary + interior, Crisp+
before → after pruning):

| Brand | 8 colours | 16 colours |
|---|---|---|
| DMC | 128 + 204 → 123 + 181 | 145 + 231 → 145 + 209 |
| Cosmo | 43 + 1 → 43 + 1 | 60 + 30 → 63 + 28 |
| Anchor | 128 + 204 → 123 + 181 | 145 + 231 → 145 + 209 |

Blurs of 0.25 and 0.5 cell are unchanged. The DMC and Anchor yellow-band
thread choice at half-cell blur (3820 rather than 725) remains.

## M4: generation time (criterion 6)

From `tests/unit/crisp-plus-timing.spec.ts`, run alone with
`CRISP_PLUS_TIMING=<file>` on the Owner's machine (Windows 11, Node 22), on
2026-09-16 at the M3 code. Photo-like synthetic sources; one untimed warm-up
per mode, then 5 alternating Crisp and Crisp+ runs.

| Configuration | Crisp median | Crisp+ median | Ratio | Target |
|---|---:|---:|---:|---:|
| 12 MP (4000×3000) → 100 stitches, 16 colours | 7,333 ms | 7,371 ms | 1.005 | ≤ 1.3 |
| 1500×1000 → 1000 stitches, 64 colours | 6,205 ms | 6,904 ms | 1.113 | ≤ 1.3 |

Individual runs, in milliseconds:
- 12 MP: Crisp 7,335 / 7,020 / 7,372 / 7,333 / 7,194; Crisp+ 7,556 / 7,371 /
  7,655 / 7,334 / 7,366.
- 1000 stitches: Crisp 6,323 / 6,264 / 6,205 / 6,191 / 6,152; Crisp+ 6,324 /
  6,949 / 6,904 / 6,874 / 6,664.

## M4: real photos (criterion 7)

From `tests/unit/crisp-plus-real-photos.spec.ts`, run with
`ENHANCEMENT_PHOTOS_DIR` and `CRISP_PLUS_REAL_PHOTOS`, on the G-032
calibration photos that show no people (kept outside the repository), at 24
colours. There is no ground truth here, so nothing is scored: the columns
report what changed and why.

- **Confident** is the share of cells the evidence layer accepts.
- **Snap + prune** is the share of cells those two steps move, measured
  against Crisp+ with both turned off.
- **Differs from Crisp** is the share of cells assigned a different colour
  than Crisp gives. It is dominated by palette training, not by the two
  steps: more confident cells mean more weighted samples, and the quantizer's
  seed depends on the distinct sample count (D061), so the whole palette can
  shift. A stage-by-stage run on underexposed-sun at 100 stitches showed
  17.61 % from evidence alone, 0.48 % added by snapping, and none by pruning.

| Photo | Grid | Confident, Crisp → Crisp+ | Snap + prune | Differs from Crisp | Colours, Crisp → Crisp+ |
|---|---|---|---:|---:|---|
| underexposed-sun | 100×67 | 0.06 % → 0.22 % | 0.5 % | 17.9 % | 18 → 19 |
| underexposed-sun | 250×167 | 0.04 % → 0.19 % | 3.3 % | 26.1 % | 23 → 23 |
| fog-sailboat | 100×75 | 1.68 % → 1.68 % | 0.05 % | 0.05 % | 23 → 23 |
| fog-sailboat | 250×188 | 1.40 % → 1.40 % | 0.6 % | 11.3 % | 24 → 23 |
| backlit-tower | 100×67 | 9.97 % → 11.57 % | 3.3 % | 34.0 % | 24 → 23 |
| backlit-tower | 250×167 | 8.89 % → 10.42 % | 2.7 % | 23.5 % | 24 → 24 |
| tree-under | 100×67 | 2.45 % → 2.52 % | 0.5 % | 22.7 % | 24 → 24 |
| tree-under | 250×167 | 1.28 % → 1.42 % | 8.2 % | 20.3 % | 24 → 19 |
| fog-brofjorden | 100×67 | 1.22 % → 1.87 % | 2.8 % | 35.3 % | 24 → 24 |
| fog-eucalypt | 100×75 | 2.09 % → 2.15 % | 2.4 % | 13.6 % | 24 → 24 |
| backlit-geyser | 100×66 | 3.08 % → 3.20 % | 10.3 % | 35.6 % | 24 → 20 |
| tree-normal | 100×67 | 2.24 % → 2.33 % | 0.2 % | 23.8 % | 24 → 24 |
| tree-over | 100×67 | 1.84 % → 1.91 % | 0.3 % | 22.5 % | 24 → 24 |
| lake-summer | 100×67 | 3.42 % → 3.78 % | 2.0 % | 24.3 % | 24 → 20 |
| road-mountains | 100×67 | 7.93 % → 8.45 % | 9.3 % | 18.0 % | 24 → 14 |

**Fewer colours than requested** was the Owner's next question, answered by M5
below. Freed slots stayed free under D140 and D141, so a photo whose blends
are removed ended well under the requested count: road-mountains kept 14 of
24, backlit-geyser and lake-summer 20.

## M5: refilling the freed slots (D142)

The Owner chose refilling by splitting over re-running colour selection, which
the stage benchmark priced at about 3.3 s extra at 1000 stitches.

Three versions were measured on the fixtures. Figures are blend boundary +
interior cells on the region scene; "lines" counts thin-line cells kept
against Crisp's own 80 / 42 / 152 / 152.

| Version | Blur 0.25 @8 | Blur 0.5 @8 | Blur 0.5 @16 | Blur 1 @8 | Blur 1 @16 | Lines | Gradient cells changed |
|---|---|---|---|---|---|---|---:|
| M4, no refill | 0 + 0 | 0 + 0 | 0 + 0 | 4 + 3 | 28 + 30 | equal to Crisp | 0 |
| Refill to the requested count, moved cells free to join | 5 + 0 | 41 + 0 | 101 + 64 | 108 + 200 | 188 + 313 | 64 of 80 lost 16 | 481 (ramp), 724 (radial) |
| Only freed slots, moved cells held out | 5 + 0 | 52 + 8 | 78 + 47 | 124 + 205 | 164 + 228 | equal to Crisp | 0 |
| **Shipped: also interior-only training and no blend-shaped splits** | **0 + 0** | **0 + 0** | **0 + 0** | **2 + 1** | **28 + 29** | **equal to Crisp** | **0** |

So the refill only works when a split learns from cells well inside their own
colour and may not produce a colour that sits between two existing ones. The
blur 1 case at 8 colours improves further (4 + 3 → 2 + 1) because the refilled
colour takes over cells a blend used to hold.

Timing with the refill, same method as M4 (5 alternating runs, run alone):

| Configuration | Crisp median | Crisp+ median | Ratio | Target |
|---|---:|---:|---:|---:|
| 12 MP (4000×3000) → 100 stitches, 16 colours | 7,570 ms | 7,931 ms | 1.048 | ≤ 1.3 |
| 1500×1000 → 1000 stitches, 64 colours | 5,777 ms | 6,566 ms | 1.137 | ≤ 1.3 |

### Real photos with the refill

Colours kept, Crisp → Crisp+ before the refill → Crisp+ with it. Everything
else in the real-photo table above is unchanged within a percentage point.

| Photo | Grid | Crisp | Before | With refill |
|---|---|---:|---:|---:|
| road-mountains | 100×67 | 24 | 14 | 14 |
| backlit-geyser | 100×66 | 24 | 20 | 20 |
| lake-summer | 100×67 | 24 | 20 | 22 |
| tree-under | 250×167 | 24 | 19 | 20 |
| fog-sailboat | 250×188 | 24 | 23 | 24 |
| backlit-tower | 250×167 | 24 | 24 | 24 |
| every other row | | 23–24 | 23–24 | 23–24 |

**Known limitation.** The refill recovers one or two colours on some photos and
none on the busiest. A split may only learn from cells well inside their own
colour (D142), and at 100 stitches a detailed photo has few such cells: almost
every cell borders a different colour. road-mountains therefore still keeps 14
of 24. Loosening that rule was measured and rejected above: it rebuilt the
blends the earlier passes removed.
