# Crisp evidence layer: speed-up and pre-filter review (G-035 M4)

Date: 2026-09-14. Synthetic fixtures are generated in code. Real photos are 20 files sampled at even intervals from
the Owner's folder, named by anonymous ID only, decoded with sharp (EXIF rotation, sRGB, 4000 px cap) into the session
scratchpad and deleted after measuring. The measurement scripts were session scratch files; their method is described
here.

## Summary

- The evidence layer now reads samples into typed arrays and converts each source row to OKLab once per job. Output is
  byte-identical. On the 12 MP benchmark the evidence layer went from 19.3 s to 4.6 s and Crisp end to end from 23.1 s
  to a median of 8.4 s, just above the 8 s target.
- The candidate pre-filter can't be made more selective without losing confident boundary cells on real photos, so it
  stays unchanged (D131).
- The pre-filter missed about 3 % of confident cells on real photos at 100 stitches, which D065 forbids. On the
  Owner's decision it was removed, and the layer now evaluates every cell (D132).

## Identical-output rewrite

`tests/unit/crisp-evidence-equivalence.spec.ts` compares every cell, with `toStrictEqual`, against a verbatim pre-M4
copy (`tests/unit/reference/crisp-edge-evidence-pre-m4.ts`). It covers 5 sources × 3 option sets, in row order and in
shuffled order. The golden hashes, including four Crisp configurations, are unchanged.

`npm run bench`, one run each:

| Measure | Before | After |
|---|---:|---:|
| Evidence layer, 12 MP → 100 st | 19.3 s | 4.6 s |
| Crisp end to end, 12 MP → 100 st | 23.1 s | 7.8 s |
| Evidence layer, 1200×800 → 300 st | 1.9 s | 0.45 s |
| Evidence layer, 1500×1000 → 1000 st | 4.0 s | 1.3 s |
| Crisp end to end, 1500×1000 → 1000 st | 25.0 s | 21.3 s |

Repeated afterwards on the same 12 MP source, 5 runs after a warm-up: Crisp median 8.37 s (8.12–8.89 s), Standard
3.2 s. The single 7.8 s run was optimistic; the ≤ 8 s target is not met.

## Pre-filter on synthetic fixtures

A cell is confident when evaluating every cell marks it so, with neighbour agreement. Two predictors were compared:
- P, today's rule: the largest pair evidence among the cell's 8 neighbours, required to be at least 0.05.
- R: the largest squared OKLab distance between the cell's average colour and each of its 8 neighbours' averages.

| Fixture | Cells | Confident | P ≥ 0.05 passes | R: lowest on a confident cell |
|---|---:|---:|---:|---:|
| Hard split with genuine gray | 256 | 80 | 37.5 % | 0.031 |
| Rotated ellipse, 8 px per stitch | 2,500 | 268 | — | 0.0039 |
| Split with noise ±30 | 1,080 | 87 | 20.6 % | 0.0078 |
| Flat noise ±40 (no boundary) | 1,080 | 0 | 99.6 % | — |
| Photo-like 1500×1000 → 300 st | 60,000 | 1,202 | — | 0.0051 |
| Photo-like 4000×3000 → 100 st | 7,500 | 520 | 96.9 %, misses 2 | 0.0099 |

R ≥ 0.002 kept every confident cell on all 15 fixtures and passed 0–32 % of cells.

## Pre-filter on real photos

| Rule | 100 st: confident missed | 100 st: cells passed | 250 st: confident missed | 250 st: cells passed |
|---|---:|---:|---:|---:|
| P ≥ 0.05 (today) | 139 of 5,018 | 81 % | 30 of 23,039 | 77 % |
| R ≥ 0.002, 3×3 | 40 | 76 % | 176 | 63 % |
| R ≥ 0.001, 3×3 | 22 | 83 % | 68 | 71 % |
| R ≥ 0.0005, 5×5 | 4 | 96 % | 2 | 90 % |

The worst single photo under today's rule kept 91 % of its confident cells at 100 stitches. Real photos have texture
in most cells, so every rule that passes few cells misses real boundaries.

## Cost of evaluating every cell on real photos

Four 4000 px photos, one run each, 100 and 250 stitches:

| Photo, stitches | Evidence layer, today's filter | Evidence layer, every cell | Confident cells, today → every cell | Crisp end to end today |
|---|---:|---:|---:|---:|
| Q12 @100 | 5.7 s | 6.3 s | 895 → 947 | 10.3 s |
| Q12 @250 | 5.3 s | 6.1 s | 3,920 → 3,927 | 10.0 s |
| Q17 @100 | 5.7 s | 6.2 s | 348 → 385 | 9.9 s |
| Q17 @250 | 5.3 s | 6.5 s | 2,195 → 2,213 | 10.6 s |
| Q13 @100 | 5.6 s | 6.1 s | 36 → 36 | 8.8 s |
| Q13 @250 | 5.6 s | 6.5 s | 84 → 84 | 10.2 s |
| Q15 @100 | 5.9 s | 6.3 s | 496 → 496 | 8.7 s |
| Q15 @250 | 5.7 s | 6.2 s | 2,018 → 2,018 | 9.9 s |

Evaluating every cell costs 0.3–1.1 s more and removes today's recall misses. On real photos Crisp end to end is
8.7–10.6 s, above the 8 s target that the synthetic benchmark meets.

## Codex critique

Codex disagreed that R is a sound rejection rule. It built two counterexamples:
- a grid where every cell average is identical, yet two adjacent cells are confident;
- a one-pixel line that is confident at 0.96 with R = 0.00008.

Confidence depends on how well two modes separate, not on how much of the cell the minority mode covers, so averaging
can hide a boundary completely. It proposed a provably lossless bound instead: reject a cell only when the colour
range of its neighbourhood's source pixels is below the 0.02 minimum mode separation. It recommended closing M4 on the
identical-output rewrite and timing it repeatedly.

## Known gaps

- Real-photo timings are single runs on four photos.
- The lossless source-range bound was not measured; on textured photos it is expected to pass nearly every cell.
