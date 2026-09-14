# Photo resolution cap: quality review (G-035 M3)

Date: 2026-09-14. Photos: 41 sampled from the Owner's folder, named by anonymous ID only; raw pixels stayed in the
session scratchpad and were deleted after measuring. Metrics come from `lib/experimental/diagnostics.ts`, always
against full-resolution truth. The measurement scripts were session scratch files; their method is described here.

## Summary

- The cap works mechanically and is fast: at 100 stitches, 6× (8 px per stitch) to 12× (2 px) faster in Standard,
  60–119× in Crisp.
- It is not quality-neutral. No factor, and no pair-evidence setting tried, passes the provisional gates. The Owner
  then cancelled the cap, and it and its comparison switch were removed (D130).
- Cause: pair-edge evidence is computed per source pixel with constants calibrated on full photos (D44). On a
  shrunk copy it saturates, so the smoothing optimizer stops penalising most boundaries and stray stitches rise.
- Full is not a consistent reference either. Its smoothing depends on each photo's native resolution, so a single
  capped setting cannot match Full on every photo.
- Weak-contrast lines 1–2 stitches wide can vanish when capped, through the same optimizer.

## Provisional gates (per stitch count, versus Full)

Confetti ratio change: median ≤ +0.005 and p90 ≤ +0.02. Edge alignment change: median ≥ −0.005. Reconstruction
error ratio: p90 ≤ 1.05. Synthetic shapes: IoU drop ≤ 0.02 at every angle and sub-stitch offset. Plus the Owner's
visual comparison, including chosen eyes, lettering, highlights and thin structures.

## Default evidence, all 41 photos (Standard, medians against Full)

| 100 stitches / 16 colors | 8 px | 4 px | 2 px |
|---|---:|---:|---:|
| Speed-up | 6.0× | 10.4× | 12.3× |
| Confetti change (Full median 0.060) | +0.016 | +0.019 | +0.027 |
| Confetti change, p90 | +0.082 | +0.132 | +0.130 |
| Edge alignment change | +0.000 | −0.010 | −0.038 |
| Reconstruction error ratio | 0.76 | 0.62 | 0.64 |

At 250 stitches: 1.6–2.8× faster, confetti +0.002 to +0.012. Palette size changed by at most 2 colors.

## Why: stage-by-stage diagnosis

On the six photos with the largest confetti rise, and four control photos:

- The assignment entering the optimizer is identical whatever the evidence setting, and confetti after
  quantization is equal or lower when capped. The rise happens in the optimizer.
- The share of neighbour pairs with zero boundary penalty (evidence ≥ 0.4737 in the fine pass) tracks the result.
  On the worst photo it is 8.3 % at Full, 62.6 % at 8 px and 83.5 % at 2 px; confetti after the optimizer is
  0.031, 0.274 and 0.393.
- Full's own share varies with native resolution: a 4000 px photo gets 8 %, a 1038 px photo gets 82 % and
  confetti 0.44 at Full, where its 2 px copy gets 0.19.

## Recalibration attempts (odd-numbered photos, 100 stitches)

Tau 0.01–0.32 (doubling) × blur radius 0–2 × 8, 4 and 2 px. No setting passes. Small tau keeps stray stitches;
tau ≥ 0.08 removes nearly all of them but over-smooths (reconstruction error ratio p90 2.2–3.4, edge alignment
down to −0.12). Closest settings:

| Setting | Confetti median / p90 | Edge alignment | Reconstruction p90 |
|---|---:|---:|---:|
| 8 px, tau 0.02, radius 1 | −0.002 / +0.044 | −0.004 | 1.37 |
| 4 px, tau 0.04, radius 0 | −0.004 / +0.036 | −0.002 | 1.57 |
| 2 px, tau 0.04, radius 0 | +0.003 / +0.074 | −0.015 | 1.41 |

A finer sweep (tau 0.015–0.05, radius 0–1) found no passing single tau either. Each photo's best-matching tau
follows its native px per stitch (Spearman 0.92 at 8 px, radius 0), so a rule tau = c × native px per stitch ÷ factor
was measured directly, with c chosen on these photos before the held-out even-numbered photos were read:

| Rule, radius 0 | Photos | Confetti median / p90 | Edge alignment | Reconstruction p90 |
|---|---|---:|---:|---:|
| 8 px, c 0.00875, 100 stitches | calibration | −0.000 / +0.025 | −0.006 | 1.08 |
| 8 px, c 0.00875, 100 stitches | held out | +0.001 / +0.032 | −0.007 | 1.07 |
| 8 px, c 0.00875, 250 stitches | held out | +0.011 / +0.076 | +0.008 | 0.91 |

The best c differs between 100 and 250 stitches, and at 4 and 2 px every c tried over-smooths (edge alignment −0.02
to −0.08). The odd/even split was checked for burst neighbours: none are split across halves.

## Synthetic phase sweep

Edges and lines at 6 angles × 4 sub-stitch offsets, strong and weak contrast, 60 stitches from 20 px per stitch:

- Edges, and strong-contrast 2-stitch lines, stay within the IoU gate at every factor and setting.
- Weak-contrast lines 1–2 stitches wide often vanish at 4 and 2 px (IoU 0.97 → 0), and the calibrated settings
  above make this worse. With the optimizer off the capped copies keep those lines as well as Full does, so the
  loss is the optimizer collapsing the palette.
- Strong 1-stitch lines at 10° and 60° are already poor at Full (IoU 0.48–0.78) and drop further when capped.
- Half-stitch lines are lost at Full at 10° and 45°, so they say nothing about the cap.

## Decode in a worker

`tests/e2e/decode-parity.spec.ts`: the worker decode matches the original `<img>` decode byte for byte for a plain
JPEG, EXIF rotation, an embedded color profile, transparency and a 5000 px photo capped to 4000 px (D128).

Uploading a synthetic 12 MP JPEG by file path, three runs showed no main-thread task over 50 ms; the largest block
was 15 ms (Chrome CPU profile). An earlier benchmark row showed one 376 ms task, but 320 ms of it was Playwright
rebuilding an in-memory upload inside the page, so `npm run bench:browser` now uploads by path. The old main-thread
decode was not re-measured that way, so there is no clean before figure. Reopening a saved file took 212 ms with no
main-thread task over 50 ms.

## Known gaps

- Crisp was measured only at default evidence on 8 photos; any evidence profile needs its own Crisp validation.
- Enhancement modes were not part of the calibration sweep.
- The earlier 10 → 16 palette jump on a synthetic shrink did not recur, but its cause is unresolved.
