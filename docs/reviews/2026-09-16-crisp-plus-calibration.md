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
