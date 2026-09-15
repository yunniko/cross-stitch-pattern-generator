# Performance results: G-035 before and after (2026-09-15)

Owner's machine (AMD Ryzen 5 5600H, 16 GB, Windows 11, Node 22). "Before" is the 2026-09-14 investigation
(`docs/reviews/2026-09-14-performance-investigation.md`) or, where noted, the benchmark taken at a milestone's start.
"After" is `npm run bench` on 2026-09-15 at commit `5ab38eb` (single runs, about ±10 % run to run), plus repeated
medians where recorded. All sources are synthetic photo-like images.

## Summary

- Generation from a 12 MP photo at 100 stitches: Standard 7.7 s → 2.9 s, Crisp 42.7 s → 7.5 s (medians of 5).
- Large grids (1500×1000 → 1000 stitches, 64 colors): Standard 13.4 s → 4.9 s, Crisp 25.0 s → 6.8 s (medians of 5).
- Exports no longer freeze the page. At 1000 stitches in the browser the Pattern Keeper PDF went from 86 s to 11.1 s
  and Export all from 122 s to 37.8 s, with no main-thread task during either.
- New finding: at 1000 stitches, showing a generated chart blocks the page once for 591 ms and reopening a saved file
  for 483 ms, after the worker has finished (likely drawing the 750,000-stitch chart; not profiled).
- Output stayed byte-identical except for two approved changes: the PDF's bytes (M2, D126) and Crisp evaluating every
  cell (M4, D132). The golden hashes are unchanged since the start of the goal.
- Not met: the browser generate target, which assumed the cancelled photo cap (D130), and G-032's 1.5 s photo
  enhancement target, which G-035 did not touch.

## Acceptance criteria

| Measure | Before | Target | After | Status |
|---|---:|---:|---:|---|
| Node Standard, 12 MP → 100 st / 16 col | 7.7 s | ≤ 4.5 s | 2.9 s (median of 5) | Met |
| Node Crisp, 12 MP → 100 st, identical output (M1) | 42.7 s | ≤ 25 s | 19.7 s at M1 | Met |
| Node Crisp, 12 MP → 100 st, after M4 | 42.7 s | ≤ 8 s | 7.5 s (median of 5); 7.9–8.4 s in earlier sessions | Met; M4 was accepted at 8.4 s |
| Node Standard, 1.5 MP → 1000 st / 64 col (M5) | 13.4 s | ≤ 8 s | 4.9 s (median of 5) | Met |
| Browser generate, 12 MP → 100 st, after the source cap (M3) | 5.0 s | ≤ 1.5 s | cap cancelled | Not reachable (D130) |
| Pattern Keeper PDF, 250 st (M2) | 5.0 s | ≤ 2.5 s | 0.86 s | Met |
| Pattern Keeper PDF, 1000 st (M2) | 86 s | ≤ 40 s | 11.1 s | Met |
| Export all, 1000 st (M2) | 122 s | ≤ 60 s | 37.8 s | Met |
| Longest main-thread task during any export (M2) | 72 s | ≤ 200 ms | 0 ms | Met |
| Longest main-thread task during photo load (M3) | 0.4 s | ≤ 100 ms | 0 ms | Met |

## Node: 12 MP photo → 100 stitches / 16 colors

| Stage | Before | After |
|---|---:|---:|
| `downsampleToGrid` | 3.0 s | 0.53 s |
| `computeEdgeMagnitude` + `computeCellImportance` | 0.8 s | 0.77 s |
| `computePairEdgeEvidence` | 4.0 s | 1.94 s |
| Crisp evidence layer | 29.8 s | 4.58 s (every cell since D132) |
| Crisp quantization stage | 0.06 s | 0.02 s |
| **Standard end to end** | **7.7 s** | **2.85 s** |
| **Crisp end to end** | **42.7 s** | **7.48 s** |
| Standard + DMC end to end | 8.1 s | 2.99 s |

Median of 5 runs on the same source after a warm-up: Standard 2.88 s, Crisp 7.49 s (7.37–7.81 s).

## Node: large grid, 1500×1000 → 1000 stitches / 64 colors

"Before" here is the benchmark at the start of M4 and M5, since the investigation measured 12 MP sources instead.

| Stage | Before | After (single run) | After (median of 5) |
|---|---:|---:|---:|
| `kMeansQuantizer` (Latest) | 3.4 s | 1.67 s | 1.51 s |
| ICM, coarse + fine | 8.5 s | 1.99 s | 1.67 s |
| Crisp evidence layer | 4.0 s | 1.27 s | — |
| Crisp quantization stage | 9.5 s | 2.12 s | 1.82 s |
| **Standard end to end** | **13.4–13.7 s** | **5.39 s** | **4.91 s** |
| **Crisp end to end** | **25.0 s** | **7.96 s** | **6.83 s** |

At 1200×800 → 300 stitches / 24 colors, Standard went from 1.5 s to 0.85 s and Crisp from 3.5 s to 1.36 s.

## Browser: what the user waits for

`npm run bench:browser` on 2026-09-15 against a production build, synthetic 4000×3000 JPEG (4.4 MB), single runs.
"Freeze" is the longest main-thread task; 0 means none over 50 ms.

| Step | 100 st / 16 col | 250 st / 32 col | 1000 st / 64 col | 1000 st before |
|---|---:|---:|---:|---:|
| Photo load | 0.29 s | 0.27 s | 0.26 s | 0.7 s |
| Generate (click → chart shown) | 3.0 s | 3.2 s | 6.9 s (freeze 0.59 s) | 12.0 s |
| Export editable JSON | 0.60 s | 0.18 s | 0.20 s | 0.3 s |
| Export OXS | 0.31 s | 0.30 s | 0.99 s | 1.0 s |
| Export PNG color | 0.18 s | 0.37 s | 2.2 s | 1.9 s (freeze 1.5 s) |
| Export PNG realistic | 0.22 s | 0.64 s | 3.6 s | 3.3 s (freeze 2.8 s) |
| Export Pattern Keeper PDF (color) | 0.37 s | 0.86 s | 11.1 s | 86.1 s (freeze 71.7 s) |
| Export A4 ZIP (color) | 0.34 s | 0.85 s | 15.6 s | 14.3 s |
| Export all | 0.94 s | 3.5 s | 37.8 s | 122.2 s (freeze 71.7 s) |
| Open saved editable JSON | 0.22 s | 0.23 s | 0.81 s (freeze 0.48 s) | 0.8 s |

Every export at every size ran with no main-thread task over 50 ms. PNG and A4 exports at 1000 stitches take about as
long as before, but they now run in a worker instead of freezing the page.

## Photo enhancement (G-032 criterion 7, under 1.5 s)

4000×3000 source, analysis plus application, single run: Auto 2.15 s, Vivid 2.10 s, Portrait 1.87 s. The target is
still not met; G-035 did not change the enhancement path.

## What changed, by milestone

| Milestone | Change | Output |
|---|---|---|
| M1 | sRGB lookup table, allocation-free OKLab conversion, 12 MP and browser benchmarks | Identical |
| M2 | Exports in a worker with `OffscreenCanvas`; direct PDF operators (D125, D126) | PDF bytes changed, Pattern Keeper import re-confirmed |
| M3 | Photo decode in a worker (D128); the photo resolution cap was cancelled (D130) | Identical |
| M4 | Crisp evidence on typed arrays with a row cache; every cell evaluated (D132) | Identical, then an approved recall fix |
| M5 | ICM skips unchanged neighbourhoods; k-means caches distances; weighted k-means on flat buffers (D133) | Identical |

## Confidence and gaps

- Single benchmark runs vary by about ±10 %, and more at 1000 stitches; medians are used where recorded.
- All sources are synthetic. Crisp on four real 4000 px photos took 8.7–10.6 s before M5 (see
  `docs/reviews/2026-09-14-crisp-prefilter.md`).
